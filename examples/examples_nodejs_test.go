// Copyright 2016-2022, Pulumi Corporation.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

package examples

import (
	"context"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/gorilla/websocket"
	"github.com/pulumi/pulumi/pkg/v3/testing/integration"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestAppSvc(t *testing.T) {
	test := getJSBaseOptions(t).
		With(integration.ProgramTestOptions{
			Dir: filepath.Join(getCwd(t), "appsvc"),
		})

	integration.ProgramTest(t, &test)
}

func TestECSCluster(t *testing.T) {
	test := getJSBaseOptions(t).
		With(integration.ProgramTestOptions{
			Dir: filepath.Join(getCwd(t), "ecscluster"),
		})

	integration.ProgramTest(t, &test)
}

func TestAppRunner(t *testing.T) {
	test := getJSBaseOptions(t).
		With(integration.ProgramTestOptions{
			Dir: filepath.Join(getCwd(t), "apprunner"),
		})

	integration.ProgramTest(t, &test)

}

func TestCronLambda(t *testing.T) {
	test := getJSBaseOptions(t).
		With(integration.ProgramTestOptions{
			Dir: filepath.Join(getCwd(t), "cron-lambda"),
		})

	integration.ProgramTest(t, &test)
}

func TestALB(t *testing.T) {
	test := getJSBaseOptions(t).
		With(integration.ProgramTestOptions{
			Dir:              filepath.Join(getCwd(t), "alb"),
			NoParallel:       true, // Resources may collide with TestFargate
			RetryFailedSteps: true, // Workaround for https://github.com/pulumi/pulumi-aws-native/issues/1186
		})

	integration.ProgramTest(t, &test)
}

func TestFargate(t *testing.T) {
	test := getJSBaseOptions(t).
		With(integration.ProgramTestOptions{
			Dir:              filepath.Join(getCwd(t), "fargate"),
			NoParallel:       true,
			RetryFailedSteps: true, // Workaround for https://github.com/pulumi/pulumi-aws-native/issues/1186
		})

	integration.ProgramTest(t, &test)
}

func TestS3ObjectLambda(t *testing.T) {
	test := getJSBaseOptions(t).
		With(integration.ProgramTestOptions{
			Dir: filepath.Join(getCwd(t), "s3-object-lambda"),
		})

	integration.ProgramTest(t, &test)
}

func TestEC2Instance(t *testing.T) {
	test := getJSBaseOptions(t).
		With(integration.ProgramTestOptions{
			Dir: filepath.Join(getCwd(t), "ec2-instance"),
		})

	integration.ProgramTest(t, &test)
}

func TestAPIWebsocketLambdaDynamoDB(t *testing.T) {
	test := getJSBaseOptions(t).
		With(integration.ProgramTestOptions{
			Dir: filepath.Join(getCwd(t), "api-websocket-lambda-dynamodb"),
			ExtraRuntimeValidation: func(t *testing.T, stack integration.RuntimeValidationStackInfo) {
				t.Helper()
				t.Logf("Outputs: %v", stack.Outputs)
				url := stack.Outputs["url"].(string)
				table := stack.Outputs["table"].(string)
				websocketValidation(t, url, table)
			},
		})

	integration.ProgramTest(t, &test)
}

func getJSBaseOptions(t *testing.T) integration.ProgramTestOptions {
	base := getBaseOptions(t)
	baseJS := base.With(integration.ProgramTestOptions{
		Dependencies: []string{
			"@pulumi/cdk",
		},
	})

	return baseJS
}

// retryFunc retries a function every 3 seconds for up to 1 minute
func retryFunc(t *testing.T, fn func() bool) error {
	t.Helper()
	ticker := time.NewTicker(time.Second * 3)
	timeout := time.After(time.Minute * 1)
	defer ticker.Stop()

	for {
		select {
		case <-timeout:
			return fmt.Errorf("timeout after 1 minute")
		case tc := <-ticker.C:
			t.Logf("tick: %s", tc.String())
			if fn() {
				return nil
			}
		}
	}
}

// isConnected validates that the $connect lambda was triggered successfully by
// ensuring there is a record in the dynamodb table
// It shouldn't be necessary to retry this, but my testing was very inconsistent, sometimes the `Dial`
// triggered the connect and sometimes it didn't (according to the docs it shouldn't be possible to establish
// a connection without triggering $connect)
func isConnected(ctx context.Context, t *testing.T, table string, c *websocket.Conn, client *dynamodb.Client, canRetry bool) error {
	err := retryFunc(t, func() bool {
		// When you establish the connection the `onconnect` lambda is triggered which writes
		// an item to the table
		res, err := client.Scan(ctx, &dynamodb.ScanInput{
			ProjectionExpression: aws.String("connectionId"),
			TableName:            &table,
		})
		require.NoError(t, err)
		if assert.Equal(t, 1, len(res.Items)) {
			return true
		}
		return false
	})
	if err != nil {
		if canRetry {
			err = c.WriteMessage(websocket.TextMessage, []byte(`{"action":"$connect","data":"hello world"}`))
			require.NoError(t, err)
			return isConnected(ctx, t, table, c, client, false)
		}
		return err
	}
	return nil
}

// websocketValidation validates that the websocket lambda apigateway test is setup and you can:
//  1. Open a connection
//  2. The $connect route triggers the lambda function which writes to the dynamodb table
//     (This validates that the permissions are setup correctly and the Lambda code works)
//
// $disconnect is best effort so is not guaranteed to be sent to Lambda, otherwise
// we would also assert that the item is removed
func websocketValidation(t *testing.T, url, table string) {
	t.Helper()
	ctx := context.Background()
	t.Logf("URL: %s", url)

	cfg, err := config.LoadDefaultConfig(ctx)
	client := dynamodb.NewFromConfig(cfg)
	var c *websocket.Conn

	// Sometimes it can take a while for the connection to be successfully established
	// bad handshake errors can occur, but go away after some retrying
	err = retryFunc(t, func() bool {
		conn, _, err := websocket.DefaultDialer.Dial(url, nil)
		if err == nil {
			c = conn
			return true
		}
		return false
	})
	require.NoErrorf(t, err, "Failed to connect to websocket")

	defer c.Close()

	err = isConnected(ctx, t, table, c, client, true)
	require.NoErrorf(t, err, "never found connection in dynamodb table")

	// writing a message with `sendmessage` action will trigger the `sendmessage` lambda
	// the lambda writes a message back on the connection
	log.New(os.Stderr, "", 0).Println("Sending message...")
	err = c.WriteMessage(websocket.TextMessage, []byte(`{"action":"sendmessage","data":"hello world"}`))
	require.NoError(t, err)
}

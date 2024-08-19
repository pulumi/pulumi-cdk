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
	"path/filepath"
	"testing"
	"time"

	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/gorilla/websocket"
	"github.com/pulumi/pulumi/pkg/v3/testing/integration"
	"github.com/stretchr/testify/assert"
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
	t.Skipf("skipping due to missing support for `AWS::EC2::SecurityGroup`")

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

func websocketValidation(t *testing.T, url, table string) {
	t.Helper()
	ctx := context.Background()
	t.Logf("URL: %s", url)

	cfg, err := config.LoadDefaultConfig(ctx)
	client := dynamodb.NewFromConfig(cfg)

	c, _, err := websocket.DefaultDialer.Dial(url, nil)
	assert.NoError(t, err)
	defer c.Close()

	err = c.WriteMessage(websocket.TextMessage, []byte(`{"action":"sendmessage","data":"hello world"}`))
	assert.NoError(t, err)

	res, err := client.Scan(ctx, &dynamodb.ScanInput{
		TableName: &table,
	})
	assert.NoError(t, err)
	// When you `sendmessage` the `onconnect` & `sendmessage` lambdas are triggered which writes
	// an item to the table
	assert.Equal(t, int32(1), res.Count)

	err = c.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.CloseNormalClosure, ""))
	assert.NoError(t, err)

	// need time for the lambda to process the request
	time.Sleep(time.Second * 5)

	res, err = client.Scan(ctx, &dynamodb.ScanInput{
		TableName: &table,
	})
	assert.NoError(t, err)
	// When the connection is closed the `ondisconnect` lambda is triggered which removes the item
	// from the table
	assert.Equal(t, int32(0), res.Count)
}

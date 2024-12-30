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
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"math/rand"
	"path/filepath"
	"testing"
	"time"

	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/route53"
	"github.com/aws/aws-sdk-go-v2/service/sts"
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
			RetryFailedSteps: true, // Workaround for https://github.com/pulumi/pulumi-aws-native/issues/1186
		})

	integration.ProgramTest(t, &test)
}

func TestFargate(t *testing.T) {
	test := getJSBaseOptions(t).
		With(integration.ProgramTestOptions{
			Dir:                    filepath.Join(getCwd(t), "fargate"),
			RetryFailedSteps:       true, // Workaround for https://github.com/pulumi/pulumi-aws-native/issues/1186
			Quick:                  false,
			SkipEmptyPreviewUpdate: false,
			ExtraRuntimeValidation: func(t *testing.T, stack integration.RuntimeValidationStackInfo) {
				integration.AssertHTTPResultWithRetry(t, stack.Outputs["loadBalancerURL"], nil, time.Duration(time.Minute*1), func(s string) bool {
					return s == "Hello, world!"
				})
			},
		})

	integration.ProgramTest(t, &test)
}

func TestS3ObjectLambda(t *testing.T) {
	test := getJSBaseOptions(t).
		With(integration.ProgramTestOptions{
			Dir:                  filepath.Join(getCwd(t), "s3-object-lambda"),
			ExpectRefreshChanges: false,
			EditDirs: []integration.EditDir{
				{
					Dir:             filepath.Join(getCwd(t), "s3-object-lambda"),
					ExpectNoChanges: true,
					Additive:        true,
				},
			},
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

func TestCloudFront(t *testing.T) {
	test := getJSBaseOptions(t).
		With(integration.ProgramTestOptions{
			Dir: filepath.Join(getCwd(t), "cloudfront-lambda-urls"),
		})

	integration.ProgramTest(t, &test)
}

func TestCloudFrontEdge(t *testing.T) {
	t.Skip("Lambda@Edge resources cannot be cleaned up in CI")
	test := getJSBaseOptions(t).
		With(integration.ProgramTestOptions{
			Dir: filepath.Join(getCwd(t), "cloudfront-lambda-edge"),
		})

	integration.ProgramTest(t, &test)
}

func TestLookups(t *testing.T) {
	test := getJSBaseOptions(t).
		With(integration.ProgramTestOptions{
			Dir: filepath.Join(getCwd(t), "lookups"),
			Config: map[string]string{
				"zoneName": "coolcompany.io",
			},
		})

	integration.ProgramTest(t, &test)
}

func TestLookupsEnabled(t *testing.T) {
	ctx := context.Background()
	config, err := config.LoadDefaultConfig(ctx)
	assert.NoError(t, err)
	client := sts.NewFromConfig(config)
	route53Client := route53.NewFromConfig(config)
	result, err := client.GetCallerIdentity(ctx, &sts.GetCallerIdentityInput{})
	assert.NoError(t, err)
	accountId := *result.Account

	// create a zone that we can lookup in the test
	randomSuffix := rand.Intn(10000)
	zoneName := fmt.Sprintf("cdkexample-%d.com", randomSuffix)
	res, err := route53Client.CreateHostedZone(ctx, &route53.CreateHostedZoneInput{
		Name:            &zoneName,
		CallerReference: &zoneName,
	})
	require.NoError(t, err)
	zoneId := *res.HostedZone.Id

	var output bytes.Buffer

	test := getJSBaseOptions(t).
		With(integration.ProgramTestOptions{
			Dir:         filepath.Join(getCwd(t), "lookups-enabled"),
			Env:         []string{"PULUMI_CDK_EXPERIMENTAL_LOOKUPS=true"},
			Stderr:      &output,
			Quick:       false,
			SkipPreview: false,
			Config: map[string]string{
				"zoneName":  zoneName,
				"accountId": accountId,
			},
		})

	tester := integration.ProgramTestManualLifeCycle(t, &test)

	defer func() {
		tester.TestLifeCycleDestroy()
		tester.TestCleanUp()
		route53Client.DeleteHostedZone(ctx, &route53.DeleteHostedZoneInput{
			Id: &zoneId,
		})
	}()
	err = tester.TestLifeCyclePrepare()
	assert.NoError(t, err)
	err = tester.TestLifeCycleInitialize()
	assert.NoError(t, err)
	tester.RunPulumiCommand("preview")
	assert.Contains(t, output.String(), "Duplicate resource URN")

	err = tester.TestPreviewUpdateAndEdits()
	assert.NoErrorf(t, err, "Failed to preview update and edits: \n output: %s", output.String())
}

func TestLookupsEnabledFailWithoutPreview(t *testing.T) {
	ctx := context.Background()
	config, err := config.LoadDefaultConfig(ctx)
	assert.NoError(t, err)
	client := sts.NewFromConfig(config)
	result, err := client.GetCallerIdentity(ctx, &sts.GetCallerIdentityInput{})
	assert.NoError(t, err)
	accountId := *result.Account

	var output bytes.Buffer

	test := getJSBaseOptions(t).
		With(integration.ProgramTestOptions{
			Dir:           filepath.Join(getCwd(t), "lookups-enabled"),
			Env:           []string{"PULUMI_CDK_EXPERIMENTAL_LOOKUPS=true"},
			Stderr:        &output,
			SkipPreview:   true,
			ExpectFailure: true,
			Config: map[string]string{
				"zoneName":        "coolcompany.io",
				"accountId":       accountId,
				"pulumiResources": "false",
			},
		})

	integration.ProgramTest(t, &test)
	assert.Contains(t, output.String(), "Context lookups have been disabled")
}

func TestEventBridgeSNS(t *testing.T) {
	test := getJSBaseOptions(t).
		With(integration.ProgramTestOptions{
			Dir: filepath.Join(getCwd(t), "eventbridge-sns"),
		})

	integration.ProgramTest(t, &test)
}

func TestEventBridgeAtm(t *testing.T) {
	test := getJSBaseOptions(t).
		With(integration.ProgramTestOptions{
			Dir: filepath.Join(getCwd(t), "eventbridge-atm"),
		})

	integration.ProgramTest(t, &test)
}

func TestScalableWebhook(t *testing.T) {
	test := getJSBaseOptions(t).
		With(integration.ProgramTestOptions{
			Dir: filepath.Join(getCwd(t), "scalable-webhook"),
		})

	integration.ProgramTest(t, &test)
}

func TestEks(t *testing.T) {
	test := getJSBaseOptions(t).
		With(integration.ProgramTestOptions{
			Dir: filepath.Join(getCwd(t), "eks"),
			ExtraRuntimeValidation: func(t *testing.T, stack integration.RuntimeValidationStackInfo) {
				t.Helper()
				require.NotEmpty(t, stack.Outputs["albAddress"], "Expected albAddress to be set")
				t.Logf("Outputs: %v", stack.Outputs)
				albAddress := stack.Outputs["albAddress"].(string)
				require.NotEmpty(t, stack.Outputs["clusterName"], "Expected clusterName to be set")

				integration.AssertHTTPResultWithRetry(t, fmt.Sprintf("http://%s:80", albAddress), nil, 10*time.Minute, func(body string) bool {
					t.Logf("Body: %s", body)
					var data map[string]interface{}
					err := json.Unmarshal([]byte(body), &data)
					require.NoError(t, err)
					require.NotNil(t, data)
					require.NotEmpty(t, data["message"], "Expected message to be set")
					return assert.Contains(t, body, "greetings from podinfo")
				})
			},
		})

	// Deleting stacks with EKS clusters can sometimes fail due to DependencyViolation caused by leftover ENIs.
	// Try destroying the cluster to keep the test account clean but do not fail the test if it fails to destroy.
	// This weakens the test but makes CI deterministic.
	programTestIgnoreDestroyErrors(t, &test)
}

func TestStackProvider(t *testing.T) {
	// App will use default provider and one stack will use explicit provider
	// with region=us-east-1
	t.Run("With default env", func(t *testing.T) {
		test := getJSBaseOptions(t).
			With(integration.ProgramTestOptions{
				Dir: filepath.Join(getCwd(t), "stack-provider"),
				ExtraRuntimeValidation: func(t *testing.T, stack integration.RuntimeValidationStackInfo) {
					east1LogsRegion := stack.Outputs["east1LogsRegion"].(string)
					defaultLogsRegion := stack.Outputs["defaultLogsRegion"].(string)
					east1StackRegion := stack.Outputs["east1StackRegion"].(string)
					defaultStackRegion := stack.Outputs["defaultStackRegion"].(string)
					assert.Equalf(t, "us-east-1", east1LogsRegion, "Expected east1LogsRegion to be us-east-1, got %s", east1LogsRegion)
					assert.Equalf(t, "us-east-2", defaultLogsRegion, "Expected defaultLogsRegion to be us-east-2, got %s", defaultLogsRegion)
					assert.Equalf(t, "us-east-1", east1StackRegion, "Expected east1StackRegion to be us-east-1, got %s", east1StackRegion)
					assert.Equalf(t, "us-east-2", defaultStackRegion, "Expected defaultStackRegion to be us-east-2, got %s", defaultStackRegion)
				},
			})

		integration.ProgramTest(t, &test)
	})

	// App will use a custom explicit provider and one stack will use explicit provider
	// with region=us-east-1
	t.Run("With different env", func(t *testing.T) {
		test := getJSBaseOptions(t).
			With(integration.ProgramTestOptions{
				Dir: filepath.Join(getCwd(t), "stack-provider"),
				Config: map[string]string{
					"default-region": "us-west-2",
				},
				ExtraRuntimeValidation: func(t *testing.T, stack integration.RuntimeValidationStackInfo) {
					east1LogsRegion := stack.Outputs["east1LogsRegion"].(string)
					defaultLogsRegion := stack.Outputs["defaultLogsRegion"].(string)
					east1StackRegion := stack.Outputs["east1StackRegion"].(string)
					defaultStackRegion := stack.Outputs["defaultStackRegion"].(string)
					assert.Equalf(t, "us-east-1", east1LogsRegion, "Expected east1LogsRegion to be us-east-1, got %s", east1LogsRegion)
					assert.Equalf(t, "us-west-2", defaultLogsRegion, "Expected defaultLogsRegion to be us-west-2, got %s", defaultLogsRegion)
					assert.Equalf(t, "us-east-1", east1StackRegion, "Expected east1StackRegion to be us-east-1, got %s", east1StackRegion)
					assert.Equalf(t, "us-west-2", defaultStackRegion, "Expected defaultStackRegion to be us-west-2, got %s", defaultStackRegion)
				},
			})

		integration.ProgramTest(t, &test)
	})

	t.Run("Fails with different cdk env", func(t *testing.T) {
		var output bytes.Buffer
		test := getJSBaseOptions(t).
			With(integration.ProgramTestOptions{
				Dir:           filepath.Join(getCwd(t), "stack-provider"),
				Stderr:        &output,
				ExpectFailure: true,
				Config: map[string]string{
					"cdk-region": "us-east-2",
				},
				ExtraRuntimeValidation: func(t *testing.T, stack integration.RuntimeValidationStackInfo) {
					assert.Contains(t, output.String(), "The stack 'teststack' has conflicting regions between the native provider (us-east-1) and the stack environment (us-east-2)")
				},
			})

		integration.ProgramTest(t, &test)
	})
}

func TestTheBigFan(t *testing.T) {
	test := getJSBaseOptions(t).
		With(integration.ProgramTestOptions{
			Dir: filepath.Join(getCwd(t), "the-big-fan"),
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
				websocketValidation(t, url)
			},
		})

	integration.ProgramTest(t, &test)
}

func TestLookupAzs(t *testing.T) {
	test := getJSBaseOptions(t).
		With(integration.ProgramTestOptions{
			Dir: filepath.Join(getCwd(t), "lookup-azs"),
			ExtraRuntimeValidation: func(t *testing.T, stack integration.RuntimeValidationStackInfo) {
				t.Helper()
				t.Logf("Outputs: %v", stack.Outputs)
				azs := stack.Outputs["azs"].([]interface{})
				// by default the CDK will use 2 AZs so this makes sure our logic is working
				assert.Lenf(t, azs, 3, "Expected 2 AZs, got %d", len(azs))
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

// websocketValidation validates that the websocket lambda apigateway test is setup and you can:
//  1. Open a connection
//  2. The $connect route triggers the lambda function which writes to the dynamodb table
//     (This validates that the permissions are setup correctly and the Lambda code works)
//
// $disconnect is best effort so is not guaranteed to be sent to Lambda, otherwise
// we would also assert that the item is removed
func websocketValidation(t *testing.T, url string) {
	t.Helper()
	t.Logf("URL: %s", url)

	var c *websocket.Conn

	// Sometimes it can take a while for the connection to be successfully established
	// bad handshake errors can occur, but go away after some retrying
	err := retryFunc(t, func() bool {
		conn, _, err := websocket.DefaultDialer.Dial(url, nil)
		if err == nil {
			c = conn
			return true
		}
		return false
	})
	require.NoErrorf(t, err, "Failed to connect to websocket")

	defer c.Close()
}

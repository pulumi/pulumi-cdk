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
	"errors"
	"fmt"
	"math/rand"
	"path/filepath"
	"testing"
	"time"

	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
	"github.com/aws/smithy-go"
	"github.com/pulumi/pulumi/pkg/v3/testing/integration"
	"github.com/stretchr/testify/assert"
)

func TestApiGateway(t *testing.T) {
	test := getJSBaseOptions(t).
		With(integration.ProgramTestOptions{
			Dir: filepath.Join(getCwd(t), "apigateway"),
		})

	integration.ProgramTest(t, &test)
}

func TestApiGatewayDomain(t *testing.T) {
	// This can be run manually in the dev account
	t.Skip("This test requires a valid public Route53 domain which doesn't exist in the CI account")
	test := getJSBaseOptions(t).
		With(integration.ProgramTestOptions{
			Dir: filepath.Join(getCwd(t), "apigateway-domain"),
		})

	integration.ProgramTest(t, &test)
}

func TestSecretsManager(t *testing.T) {
	test := getJSBaseOptions(t).
		With(integration.ProgramTestOptions{
			Dir: filepath.Join(getCwd(t), "secretsmanager"),
		})

	integration.ProgramTest(t, &test)
}

func TestEc2(t *testing.T) {
	test := getJSBaseOptions(t).
		With(integration.ProgramTestOptions{
			Dir: filepath.Join(getCwd(t), "ec2"),
		})

	integration.ProgramTest(t, &test)
}

func TestRoute53(t *testing.T) {
	test := getJSBaseOptions(t).
		With(integration.ProgramTestOptions{
			Dir: filepath.Join(getCwd(t), "route53"),
			Config: map[string]string{
				// This test has to be run in us-east-1 for DNSSEC
				"aws:region":        "us-east-1",
				"aws-native:region": "us-east-1",
			},
		})

	integration.ProgramTest(t, &test)
}

func TestKms(t *testing.T) {
	test := getJSBaseOptions(t).
		With(integration.ProgramTestOptions{
			Dir: filepath.Join(getCwd(t), "kms"),
		})

	integration.ProgramTest(t, &test)
}

func TestLogs(t *testing.T) {
	test := getJSBaseOptions(t).
		With(integration.ProgramTestOptions{
			Dir: filepath.Join(getCwd(t), "logs"),
		})

	integration.ProgramTest(t, &test)
}

func TestMisc(t *testing.T) {
	test := getJSBaseOptions(t).
		With(integration.ProgramTestOptions{
			Dir: filepath.Join(getCwd(t), "misc-services"),
			ExtraRuntimeValidation: func(t *testing.T, stack integration.RuntimeValidationStackInfo) {
				repoName := stack.Outputs["repoName"].(string)
				assert.Containsf(t, repoName, "testrepo", "Expected repoName to contain 'testrepo'; got %s", repoName)
			},
		})

	integration.ProgramTest(t, &test)
}

func TestCloudFront(t *testing.T) {
	test := getJSBaseOptions(t).
		With(integration.ProgramTestOptions{
			Dir: filepath.Join(getCwd(t), "cloudfront"),
			ExtraRuntimeValidation: func(t *testing.T, stack integration.RuntimeValidationStackInfo) {
				bucketName := stack.Outputs["bucketName"].(string)
				assert.Containsf(t, bucketName, "bucket", "Bucket name should contain 'bucket'")
			},
		})

	integration.ProgramTest(t, &test)
}

func TestErrors(t *testing.T) {
	var buf bytes.Buffer
	test := getJSBaseOptions(t).
		With(integration.ProgramTestOptions{
			Dir:           filepath.Join(getCwd(t), "errors-test"),
			Stderr:        &buf,
			ExpectFailure: true,
		})

	integration.ProgramTest(t, &test)
	assert.Containsf(t, buf.String(), "Error: Event Bus policy statements must have a sid", "Expected error message not found in pulumi up output")
}

// TestCustomResource tests that CloudFormation Custom Resources work as expected. The test deploys two custom resources. One for cleaning the
// S3 bucket on delete and another for uploading the index.html file for a static website to the bucket.
// The test validates that the website is deployed, displays the expected content and gets cleaned up on delete.
func TestCustomResource(t *testing.T) {
	test := getJSBaseOptions(t).
		With(integration.ProgramTestOptions{
			Dir: filepath.Join(getCwd(t), "custom-resource"),
			ExtraRuntimeValidation: func(t *testing.T, stack integration.RuntimeValidationStackInfo) {
				t.Logf("Outputs: %v", stack.Outputs)
				url := stack.Outputs["websiteUrl"].(string)
				assert.NotEmpty(t, url)

				// Validate that the index.html file is deployed
				integration.AssertHTTPResultWithRetry(t, url, nil, 60*time.Second, func(body string) bool {
					return assert.Equal(t, "Hello, World!", body, "Body should equal 'Hello, World!', got %s", body)
				})

				objectKeys := stack.Outputs["objectKeys"].([]interface{})
				assert.NotEmpty(t, objectKeys)
			},
		})

	integration.ProgramTest(t, &test)
}

func TestNestedStacks(t *testing.T) {
	test := getJSBaseOptions(t).
		With(integration.ProgramTestOptions{
			Dir: filepath.Join(getCwd(t), "nested-stacks"),
			ExtraRuntimeValidation: func(t *testing.T, stack integration.RuntimeValidationStackInfo) {
				t.Logf("Outputs: %v", stack.Outputs)
				bucketUrl := stack.Outputs["bucketWebsiteUrl"].(string)
				assert.NotEmpty(t, bucketUrl)
				integration.AssertHTTPResultWithRetry(t, bucketUrl, nil, 60*time.Second, func(body string) bool {
					return assert.Equal(t, "Hello, World!", body, "Body should equal 'Hello, World!', got %s", body)
				})
			},
		})

	integration.ProgramTest(t, &test)
}

func TestReplaceOnChanges(t *testing.T) {
	test := getJSBaseOptions(t).
		With(integration.ProgramTestOptions{
			Dir: filepath.Join(getCwd(t), "replace-on-changes"),
			EditDirs: []integration.EditDir{
				{
					Dir:      filepath.Join(getCwd(t), "replace-on-changes/step2"),
					Additive: true,
				},
			},
		})

	integration.ProgramTest(t, &test)
}

func TestSsmDynamic(t *testing.T) {
	test := getJSBaseOptions(t).
		With(integration.ProgramTestOptions{
			Dir: filepath.Join(getCwd(t), "ssm-dynamic"),
			EditDirs: []integration.EditDir{
				{
					Dir:      filepath.Join(getCwd(t), "ssm-dynamic/step2"),
					Additive: true,
					ExtraRuntimeValidation: func(t *testing.T, stack integration.RuntimeValidationStackInfo) {
						t.Logf("\nOutputs: %v\n\n", stack.Outputs)

						stringValue := stack.Outputs["stringValue"].(string)
						assert.Equal(t, "testvalue", stringValue)

						stringListValue := stack.Outputs["stringListValue"].([]interface{})
						assert.Equal(t, []interface{}{"abcd", "xyz"}, stringListValue)

						dynamicStringValue := stack.Outputs["dynamicStringValue"].(string)
						assert.Equal(t, "testvalue", dynamicStringValue)

						dyanmicStringListValue := stack.Outputs["dynamicStringListValue"].([]interface{})
						assert.Equal(t, []interface{}{"abcd", "xyz"}, dyanmicStringListValue)

					},
				},
			},
		})

	integration.ProgramTest(t, &test)
}

func TestRemovalPolicy(t *testing.T) {
	// Since we are creating two tests we have to set `NoParallel` on each test
	// and set parallel here.
	t.Parallel()
	ctx := context.Background()
	config, err := config.LoadDefaultConfig(ctx)
	assert.NoError(t, err)
	client := s3.NewFromConfig(config)

	suffix := rand.Intn(10000)
	bucketName := fmt.Sprintf("pulumi-cdk-removal-test-%d", suffix)
	t.Logf("Bucket name: %s", bucketName)

	testConfig := map[string]string{
		"bucketName": bucketName,
	}

	// ----------------------------------------------------------
	// Step 1: Create a bucket with a removal policy of 'retain'
	// ----------------------------------------------------------
	test1 := getJSBaseOptions(t).
		With(integration.ProgramTestOptions{
			Dir:        filepath.Join(getCwd(t), "removal-policy"),
			NoParallel: true,
			Config:     testConfig,
		})

	integration.ProgramTest(t, &test1)

	// Assert that the bucket still exists
	exists, err := bucketExists(ctx, client, bucketName)
	assert.NoError(t, err)
	assert.True(t, exists)

	// Delete the bucket before Step 2.
	_, err = client.DeleteBucket(ctx, &s3.DeleteBucketInput{
		Bucket: &bucketName,
	})
	assert.NoError(t, err)

	// ----------------------------------------------------------
	// Step 2: Create a new stack with the same bucket name and a removal policy of 'destroy'
	// ----------------------------------------------------------
	test2 := getJSBaseOptions(t).With(integration.ProgramTestOptions{
		Dir:        filepath.Join(getCwd(t), "removal-policy/step2"),
		NoParallel: true,
		Config:     testConfig,
	})
	integration.ProgramTest(t, &test2)

	// Assert that the bucket no longer exists
	exists, err = bucketExists(ctx, client, bucketName)
	assert.NoError(t, err)
	assert.False(t, exists)
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

func bucketExists(ctx context.Context, client *s3.Client, bucketName string) (bool, error) {
	_, err := client.HeadBucket(ctx, &s3.HeadBucketInput{
		Bucket: &bucketName,
	})
	if err != nil {
		var apiError smithy.APIError
		if errors.As(err, &apiError) {
			switch apiError.(type) {
			case *types.NotFound:
				return false, nil
			}
		}
		return false, err
	}
	return true, nil
}

func TestKinesis(t *testing.T) {
	test := getJSBaseOptions(t).
		With(integration.ProgramTestOptions{
			Dir: filepath.Join(getCwd(t), "kinesis"),
			ExtraRuntimeValidation: func(t *testing.T, stack integration.RuntimeValidationStackInfo) {
				kinesisStreamName := stack.Outputs["kinesisStreamName"].(string)
				assert.Containsf(t, kinesisStreamName, "mystream", "Kinesis stream name should contain 'mystream'")
			},
		})

	integration.ProgramTest(t, &test)
}

func TestUnsupportedError(t *testing.T) {
	var output bytes.Buffer

	test := getJSBaseOptions(t).
		With(integration.ProgramTestOptions{
			Dir:           filepath.Join(getCwd(t), "unsupported-error"),
			Stderr:        &output,
			SkipPreview:   true,
			ExpectFailure: true,
		})

	integration.ProgramTest(t, &test)
	assert.Contains(t, output.String(), "Resource type 'AWS::ServiceCatalog::Portfolio' is not supported by AWS Cloud Control.")
}

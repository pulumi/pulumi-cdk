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
	"path/filepath"
	"testing"
	"time"

	"github.com/aws/aws-sdk-go/aws/session"
	"github.com/aws/aws-sdk-go/service/sts"
	"github.com/pulumi/pulumi/pkg/v3/testing/integration"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
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
				assert.Containsf(t, repoName, "testrepob5dda46f", "Expected repoName to contain 'testrepob5dda46f'; got %s", repoName)
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
				assert.Containsf(t, bucketName, "bucket83908e77", "Bucket name should contain 'bucket'")
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
	sess := session.Must(session.NewSessionWithOptions(session.Options{
		SharedConfigState: session.SharedConfigEnable,
	}))
	svc := sts.New(sess)

	result, err := svc.GetCallerIdentity(&sts.GetCallerIdentityInput{})
	require.NoError(t, err, "Failed to get AWS account ID")
	accountId := *result.Account

	test := getJSBaseOptions(t).
		With(integration.ProgramTestOptions{
			Dir: filepath.Join(getCwd(t), "custom-resource"),
			Config: map[string]string{
				"accountId": accountId,
			},
			// Workaround until TODO[pulumi/pulumi-aws-native#1816] is resolved.
			Env: []string{"PULUMI_CDK_EXPERIMENTAL_MAX_NAME_LENGTH=56"},
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

func getJSBaseOptions(t *testing.T) integration.ProgramTestOptions {
	base := getBaseOptions(t)
	baseJS := base.With(integration.ProgramTestOptions{
		Dependencies: []string{
			"@pulumi/cdk",
		},
	})

	return baseJS
}

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
	"path/filepath"
	"testing"

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
				assert.Containsf(t, repoName, "testrepob5dda46f", "Expected repoName to contain 'testrepob5dda46f'; got %s", repoName)
			},
		})

	integration.ProgramTest(t, &test)
}

func TestCloudFront(t *testing.T) {
	test := getJSBaseOptions(t).
		With(integration.ProgramTestOptions{
			Dir: filepath.Join(getCwd(t), "cloudfront"),
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

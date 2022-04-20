// Copyright 2016-2021, Pulumi Corporation.  All rights reserved.

package examples

import (
	"path/filepath"
	"testing"

	"github.com/pulumi/pulumi/pkg/v3/testing/integration"
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
	t.Skipf("skipping due to missing support for `AWS::EC2::SecurityGroup`")

	test := getJSBaseOptions(t).
		With(integration.ProgramTestOptions{
			Dir: filepath.Join(getCwd(t), "alb"),
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

func getJSBaseOptions(t *testing.T) integration.ProgramTestOptions {
	base := getBaseOptions(t)
	baseJS := base.With(integration.ProgramTestOptions{
		Dependencies: []string{
			"@pulumi/cdk",
		},
	})

	return baseJS
}

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
	"fmt"
	"math/rand"
	"os"
	"strconv"
	"testing"

	"github.com/pulumi/pulumi/pkg/v3/testing/integration"
)

func getPrefix() string {
	prefix := os.Getenv("GITHUB_SHA")
	if prefix == "" {
		prefix = strconv.Itoa(rand.Intn(10000))
	}
	if len(prefix) > 5 {
		prefix = prefix[:5]
	}
	// has to start with a letter
	return fmt.Sprintf("a%s", prefix)
}

func getEnvRegion(t *testing.T) string {
	envRegion := os.Getenv("AWS_REGION")
	if envRegion == "" {
		t.Skipf("Skipping test due to missing AWS_REGION environment variable")
	}

	return envRegion
}

func getCwd(t *testing.T) string {
	cwd, err := os.Getwd()
	if err != nil {
		t.FailNow()
	}

	return cwd
}

func getBaseOptions(t *testing.T) integration.ProgramTestOptions {
	envRegion := getEnvRegion(t)
	prefix := getPrefix()
	return integration.ProgramTestOptions{
		Config: map[string]string{
			"aws:region":        envRegion,
			"aws-native:region": envRegion,
			"prefix":            prefix,
		},
		// some flakiness in some resource creation
		// @see https://github.com/pulumi/pulumi-aws-native/issues/1714
		RetryFailedSteps:     true,
		ExpectRefreshChanges: true,
		SkipRefresh:          true,
		Quick:                true,
	}
}

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
	"errors"
	"fmt"
	"math/rand"
	"os"
	"strconv"
	"testing"

	"github.com/pulumi/pulumi/pkg/v3/testing/integration"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
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
	t.Logf("using prefix: %s", prefix)
	return integration.ProgramTestOptions{
		Config: map[string]string{
			"aws:region":        envRegion,
			"aws-native:region": envRegion,
			"prefix":            prefix,
		},
		SkipRefresh:          true,
		ExpectRefreshChanges: true,
	}
}

func programTestIgnoreDestroyErrors(
	t *testing.T,
	opts *integration.ProgramTestOptions,
) {
	pt := integration.ProgramTestManualLifeCycle(t, opts)

	require.Falsef(t, opts.DestroyOnCleanup, "DestroyOnCleanup is not supported")
	require.Falsef(t, opts.RunUpdateTest, "RunUpdateTest is not supported")

	destroyStack := func() {
		destroyErr := pt.TestLifeCycleDestroy()
		if destroyErr != nil {
			t.Logf("IgnoreDestroyErrors: ignoring %v", destroyErr)
		}
	}

	// Inlined pt.TestLifeCycleInitAndDestroy()
	testLifeCycleInitAndDestroy := func() error {
		err := pt.TestLifeCyclePrepare()
		if err != nil {
			return fmt.Errorf("copying test to temp dir: %w", err)
		}

		pt.TestFinished = false
		defer pt.TestCleanUp()

		err = pt.TestLifeCycleInitialize()
		if err != nil {
			return fmt.Errorf("initializing test project: %w", err)
		}
		// Ensure that before we exit, we attempt to destroy and remove the stack.
		defer destroyStack()

		if err = pt.TestPreviewUpdateAndEdits(); err != nil {
			return fmt.Errorf("running test preview, update, and edits: %w", err)
		}
		pt.TestFinished = true
		return nil
	}

	err := testLifeCycleInitAndDestroy()
	if !errors.Is(err, integration.ErrTestFailed) {
		assert.NoError(t, err)
	}
}

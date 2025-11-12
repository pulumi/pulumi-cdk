/**
 * Core conversion primitives will be migrated here from the existing Pulumi runtime
 * integration. For now we expose a placeholder API so the package builds cleanly.
 */
export interface PlaceholderCoreModule {
  readonly kind: "placeholder";
}

export const placeholder: PlaceholderCoreModule = {
  kind: "placeholder",
};

<!-- action-docs-header source="action.yml" -->

<!-- action-docs-header source="action.yml" -->

<!-- action-docs-description source="action.yml" -->

## Description

Sets Google Secret manager secrets in the environment.

<!-- action-docs-description source="action.yml" -->

<!-- action-docs-inputs source="action.yml" -->

## Inputs

| name         | description                                                           | required | default |
| ------------ | --------------------------------------------------------------------- | -------- | ------- |
| `project_id` | <p>The project to create or update the secret in.</p>                 | `true`   | `""`    |
| `secrets`    | <p>A comma separated list of <key=value> pairs to set as secrets.</p> | `true`   | `""`    |

<!-- action-docs-inputs source="action.yml" -->

<!-- action-docs-outputs source="action.yml" -->

## Outputs

| name              | description                         |
| ----------------- | ----------------------------------- |
| `updated_secrets` | <p>The list of updated secrets.</p> |

<!-- action-docs-outputs source="action.yml" -->

<!-- action-docs-runs source="action.yml" -->

## Runs

This action is a `node20` action.

<!-- action-docs-runs source="action.yml" -->

## Example usage

```yaml
name: Set Google Secret Manager Secrets
on: push

env:
  project_id: ${{ secrets.GCP_PROJECT_ID }}

jobs:
  set-secrets:
    runs-on: ubuntu-latest

    permissions:
      contents: read
      id-token: write

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Authenticate to Google Cloud
        uses: google-github-actions/auth@v2
        with:
          project_id: my-project
          workload_identity_provider: projects/123456789/locations/global/workloadIdentityPools/my-pool/providers/my-provider
          service_account: my-service-account@my-project.iam.gserviceaccount.com

      - name: Set secrets
        uses: thoughtgears/set-secret-manager-secrets@v1
        with:
          project_id: my-project
          secrets: MY_SECRET=my-secret-value,ANOTHER_SECRET=another-secret-value
```

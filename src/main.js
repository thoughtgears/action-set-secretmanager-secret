const core = require('@actions/core')
const { SecretManagerServiceClient } = require('@google-cloud/secret-manager')

/**
 * The main function for the action.
 *
 * @returns {Promise<void>} Resolves when the action is complete.
 */
async function run() {
  const projectId = core.getInput('project_id', { required: true })
  const secrets = core.getInput('secrets', { required: true })

  const secretsArray = secrets
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .map((item) => {
      const [key, value] = item.split('=')
      return {
        key: key.trim(),
        value: (value === undefined ? '' : value).trim() // Ensure value is a string even if missing
      }
    })

  for (const secret of secretsArray) {
    if (!secret.key) {
      core.setFailed('Invalid secrets format: Found an entry with an empty key.')
      return
    }
  }

  const client = new SecretManagerServiceClient({
    projectId
  })

  const updatedSecrets = []
  const parent = `projects/${projectId}`

  try {
    for (const secret of secretsArray) {
      const secretName = `projects/${projectId}/secrets/${secret.key}`
      let secretExists = false

      // Check if secret exists
      try {
        await client.getSecret({ name: secretName })
        secretExists = true
      } catch (error) {
        // Error code 5 means "NOT_FOUND"
        if (error.code === 5) {
          secretExists = false
        } else {
          if (error instanceof Error) {
            core.setFailed(`Error checking secret ${secret.key}: ${error.message}`)
            return
          } else {
            core.setFailed(`An unknown error occurred while checking secret ${secret.key}`)
            return
          }
        }
      }

      // If the secret doesn't exist, create it
      // then add the secret version and push
      // the secret key to the updatedSecrets array
      if (!secretExists) {
        try {
          await client.createSecret({
            parent,
            secretId: secret.key,
            secret: {
              replication: {
                automatic: {}
              }
            }
          })

          await client.addSecretVersion({
            parent: secretName,
            payload: {
              data: Buffer.from(secret.value, 'utf8')
            }
          })

          updatedSecrets.push(secret.key)
          continue // Skip to next secret since we've already created and set the value
        } catch (error) {
          if (error instanceof Error) {
            core.setFailed(`Error creating secret ${secret.key} or adding initial version: ${error.message}`)
            return
          } else {
            core.setFailed(`An unknown error occurred while creating secret ${secret.key}`)
            return
          }
        }
      }

      // If the secret exists, check if the value is different
      // If it is, add a new version
      // If it isn't, do nothing
      if (secretExists) {
        try {
          const [versionResponse] = await client.accessSecretVersion({
            name: `${secretName}/versions/latest`
          })

          const currentSecretData = versionResponse.payload?.data?.toString('utf8')

          if (currentSecretData === undefined) {
            core.warning(`Could not retrieve current data for secret ${secret.key}. Adding a new version.`)
            // Treat inability to read current value as needing an update
            await client.addSecretVersion({
              parent: secretName,
              payload: {
                data: Buffer.from(secret.value, 'utf8')
              }
            })
            updatedSecrets.push(secret.key)
          } else if (currentSecretData !== secret.value) {
            // Value is different, add a new version
            await client.addSecretVersion({
              parent: secretName,
              payload: {
                data: Buffer.from(secret.value, 'utf8')
              }
            })
            updatedSecrets.push(secret.key)
            core.info(`Updated secret ${secret.key} with a new version.`)
          } else {
            core.info(`Secret ${secret.key} is already up-to-date.`)
          }
        } catch (error) {
          if (error.code === 5) {
            // If accessing 'latest' fails with NOT_FOUND, it might mean the secret exists but has no enabled versions. Add one.
            core.warning(`Secret ${secret.key} exists but failed to access latest version (perhaps no enabled versions?). Adding a new version.`)
            try {
              await client.addSecretVersion({
                parent: secretName,
                payload: {
                  data: Buffer.from(secret.value, 'utf8')
                }
              })
              updatedSecrets.push(secret.key)
            } catch (addVersionError) {
              if (addVersionError instanceof Error) {
                core.setFailed(`Error adding version to secret ${secret.key} after failing to access latest: ${addVersionError.message}`)
                return
              } else {
                core.setFailed(`An unknown error occurred while adding version to secret ${secret.key}`)
                return
              }
            }
          } else {
            // Handle other unexpected errors during accessSecretVersion or addSecretVersion
            if (error instanceof Error) {
              core.setFailed(`Error accessing/updating secret ${secret.key}: ${error.message}`)
              return
            } else {
              core.setFailed(`An unknown error occurred while accessing/updating secret ${secret.key}`)
              return
            }
          }
        }
      }
    }
    core.setOutput('updated_secrets', updatedSecrets)
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message)
    } else {
      core.setFailed('An unknown error occurred during action execution.')
    }
  }
}

module.exports = { run }

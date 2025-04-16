// run.test.js
const core = require('@actions/core')
const { SecretManagerServiceClient } = require('@google-cloud/secret-manager')
const { run } = require('../src/main') // Assuming run.js is in src/main.js relative to project root
const { describe, beforeEach, it, expect } = require('@jest/globals')

// --- Mocking Setup ---

// Mock the entire @actions/core module
jest.mock('@actions/core', () => ({
  getInput: jest.fn(),
  setOutput: jest.fn(),
  setFailed: jest.fn(),
  info: jest.fn(), // Mock info as it's used in the latest run.js
  warning: jest.fn(), // Mock warning as it's used
  error: jest.fn() // Mock error as it's used
}))

// Mock the SecretManagerServiceClient and its methods
const mockGetSecret = jest.fn()
const mockCreateSecret = jest.fn()
const mockAddSecretVersion = jest.fn()
const mockAccessSecretVersion = jest.fn()

jest.mock('@google-cloud/secret-manager', () => ({
  SecretManagerServiceClient: jest.fn().mockImplementation(() => ({
    getSecret: mockGetSecret,
    createSecret: mockCreateSecret,
    addSecretVersion: mockAddSecretVersion,
    accessSecretVersion: mockAccessSecretVersion
  }))
}))

// --- Test Suites ---

describe('GitHub Action Run Function', () => {
  const MOCK_PROJECT_ID = 'test-project-123'

  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks()

    // Default mock implementations (can be overridden in specific tests)
    core.getInput.mockImplementation((name) => {
      if (name === 'project_id') return MOCK_PROJECT_ID
      if (name === 'secrets') return '' // Default to no secrets
      return ''
    })

    // Default mock behaviors - adjust per test as needed
    // Simulate secret not found by default for getSecret
    mockGetSecret.mockRejectedValue({ code: 5, message: 'Secret not found' })
    // Simulate successful creation by default
    mockCreateSecret.mockResolvedValue([{}])
    // Simulate successful version add by default
    mockAddSecretVersion.mockResolvedValue([{}])
    // Simulate accessSecretVersion failing with NOT_FOUND by default (e.g., no versions exist)
    mockAccessSecretVersion.mockRejectedValue({ code: 5, message: 'Version not found' })
  })

  // --- Test Cases ---

  it('should create a new secret if it does not exist', async () => {
    const secretKey = 'NEW_SECRET'
    const secretValue = 'new_value'
    core.getInput.mockImplementation((name) => {
      if (name === 'project_id') return MOCK_PROJECT_ID
      if (name === 'secrets') return `${secretKey}=${secretValue}`
      return ''
    })

    // Setup: getSecret rejects with NOT_FOUND (default beforeEach is fine)
    // Setup: createSecret and addSecretVersion resolve (default beforeEach is fine)

    await run()

    // Verify checks
    expect(mockGetSecret).toHaveBeenCalledWith({
      name: `projects/${MOCK_PROJECT_ID}/secrets/${secretKey}`
    })
    // Verify creation and version add
    expect(mockCreateSecret).toHaveBeenCalledWith({
      parent: `projects/${MOCK_PROJECT_ID}`,
      secretId: secretKey,
      secret: { replication: { automatic: {} } }
    })
    expect(mockAddSecretVersion).toHaveBeenCalledWith({
      parent: `projects/${MOCK_PROJECT_ID}/secrets/${secretKey}`,
      payload: { data: Buffer.from(secretValue, 'utf8') }
    })
    // Verify output - should be called at the end if no errors
    expect(core.setOutput).toHaveBeenCalledWith('updated_secrets', [secretKey])
    expect(core.setFailed).not.toHaveBeenCalled()
  })

  it('should update an existing secret if value is different', async () => {
    const secretKey = 'EXISTING_SECRET'
    const newValue = 'new_secret_value'
    const oldValue = 'old_secret_value'
    core.getInput.mockImplementation((name) => {
      if (name === 'project_id') return MOCK_PROJECT_ID
      if (name === 'secrets') return `${secretKey}=${newValue}`
      return ''
    })

    // Setup: Simulate secret exists
    mockGetSecret.mockResolvedValue([{}])
    // Setup: Simulate accessing existing version with different value
    mockAccessSecretVersion.mockResolvedValue([{ payload: { data: Buffer.from(oldValue, 'utf8') } }])
    // Setup: addSecretVersion resolves (default beforeEach is fine)

    await run()

    // Verify checks
    expect(mockGetSecret).toHaveBeenCalledWith({
      name: `projects/${MOCK_PROJECT_ID}/secrets/${secretKey}`
    })
    expect(mockAccessSecretVersion).toHaveBeenCalledWith({
      name: `projects/${MOCK_PROJECT_ID}/secrets/${secretKey}/versions/latest`
    })
    // Verify only adding version (no creation)
    expect(mockCreateSecret).not.toHaveBeenCalled()
    expect(mockAddSecretVersion).toHaveBeenCalledWith({
      parent: `projects/${MOCK_PROJECT_ID}/secrets/${secretKey}`,
      payload: { data: Buffer.from(newValue, 'utf8') }
    })
    // Verify output - should be called at the end if no errors
    expect(core.setOutput).toHaveBeenCalledWith('updated_secrets', [secretKey])
    expect(core.setFailed).not.toHaveBeenCalled()
  })

  it('should not update an existing secret if value is the same', async () => {
    const secretKey = 'EXISTING_SECRET_SAME'
    const sameValue = 'same_value'
    core.getInput.mockImplementation((name) => {
      if (name === 'project_id') return MOCK_PROJECT_ID
      if (name === 'secrets') return `${secretKey}=${sameValue}`
      return ''
    })

    // Setup: Simulate secret exists
    mockGetSecret.mockResolvedValue([{}])
    // Setup: Simulate accessing existing version with the same value
    mockAccessSecretVersion.mockResolvedValue([{ payload: { data: Buffer.from(sameValue, 'utf8') } }])

    await run()

    // Verify checks
    expect(mockGetSecret).toHaveBeenCalledWith({
      name: `projects/${MOCK_PROJECT_ID}/secrets/${secretKey}`
    })
    expect(mockAccessSecretVersion).toHaveBeenCalledWith({
      name: `projects/${MOCK_PROJECT_ID}/secrets/${secretKey}/versions/latest`
    })
    // Verify no creation or version add
    expect(mockCreateSecret).not.toHaveBeenCalled()
    expect(mockAddSecretVersion).not.toHaveBeenCalled()
    // Verify output - should be called at the end, key not included
    expect(core.setOutput).toHaveBeenCalledWith('updated_secrets', []) // Empty array
    expect(core.setFailed).not.toHaveBeenCalled()
  })

  it('should add a version if accessing latest fails with NOT_FOUND', async () => {
    const secretKey = 'EXISTING_SECRET_NO_VERSION'
    const newValue = 'value_for_no_version_secret'
    core.getInput.mockImplementation((name) => {
      if (name === 'project_id') return MOCK_PROJECT_ID
      if (name === 'secrets') return `${secretKey}=${newValue}`
      return ''
    })

    // Setup: Simulate secret exists
    mockGetSecret.mockResolvedValue([{}])
    // Setup: Simulate accessing latest version fails with NOT_FOUND
    mockAccessSecretVersion.mockRejectedValue({ code: 5, message: 'Version not found' })
    // Setup: addSecretVersion resolves (default beforeEach is fine)

    await run()

    // Verify checks
    expect(mockGetSecret).toHaveBeenCalledWith({
      name: `projects/${MOCK_PROJECT_ID}/secrets/${secretKey}`
    })
    expect(mockAccessSecretVersion).toHaveBeenCalledWith({
      name: `projects/${MOCK_PROJECT_ID}/secrets/${secretKey}/versions/latest`
    })
    // Verify only adding version (no creation)
    expect(mockCreateSecret).not.toHaveBeenCalled()
    // Verify addSecretVersion was called because currentSecretData became undefined
    expect(mockAddSecretVersion).toHaveBeenCalledWith({
      parent: `projects/${MOCK_PROJECT_ID}/secrets/${secretKey}`,
      payload: { data: Buffer.from(newValue, 'utf8') }
    })
    // Verify output - should be called at the end
    expect(core.setOutput).toHaveBeenCalledWith('updated_secrets', [secretKey])
    expect(core.setFailed).not.toHaveBeenCalled()
  })

  it('should handle multiple secrets correctly (create, update, no change)', async () => {
    const newKey = 'NEW_MULTI'
    const newValue = 'new_multi_val'
    const updateKey = 'UPDATE_MULTI'
    const updateNewValue = 'update_new_val'
    const updateOldValue = 'update_old_val'
    const noChangeKey = 'NOCHANGE_MULTI'
    const noChangeValue = 'nochange_val'

    core.getInput.mockImplementation((name) => {
      if (name === 'project_id') return MOCK_PROJECT_ID
      if (name === 'secrets') return `${newKey}=${newValue}, ${updateKey}=${updateNewValue}, ${noChangeKey}=${noChangeValue}`
      return ''
    })

    // Setup mocks for each scenario in order
    mockGetSecret
      .mockRejectedValueOnce({ code: 5 }) // 1. NEW_MULTI not found
      .mockResolvedValueOnce([{}]) // 2. UPDATE_MULTI found
      .mockResolvedValueOnce([{}]) // 3. NOCHANGE_MULTI found

    // Setup accessSecretVersion calls in order
    // Note: No access call for NEW_MULTI
    mockAccessSecretVersion
      .mockResolvedValueOnce([
        // 1. For UPDATE_MULTI - different value
        { payload: { data: Buffer.from(updateOldValue, 'utf8') } }
      ])
      .mockResolvedValueOnce([
        // 2. For NOCHANGE_MULTI - same value
        { payload: { data: Buffer.from(noChangeValue, 'utf8') } }
      ])

    // Setup: createSecret and addSecretVersion resolve (default beforeEach is fine)

    await run()

    // Verify calls
    expect(mockGetSecret).toHaveBeenCalledTimes(3)
    expect(mockCreateSecret).toHaveBeenCalledTimes(1)
    expect(mockCreateSecret).toHaveBeenCalledWith(expect.objectContaining({ secretId: newKey }))
    expect(mockAddSecretVersion).toHaveBeenCalledTimes(2) // Once for new, once for update
    expect(mockAddSecretVersion).toHaveBeenCalledWith(expect.objectContaining({ parent: expect.stringContaining(newKey) }))
    expect(mockAddSecretVersion).toHaveBeenCalledWith(expect.objectContaining({ parent: expect.stringContaining(updateKey) }))
    expect(mockAccessSecretVersion).toHaveBeenCalledTimes(2) // For update and nochange

    // Verify output - only new and updated keys
    expect(core.setOutput).toHaveBeenCalledWith('updated_secrets', [newKey, updateKey])
    expect(core.setFailed).not.toHaveBeenCalled()
  })

  it('should handle secrets input with extra spacing and filter empty items', async () => {
    const key1 = 'KEY_ONE'
    const val1 = 'val1'
    const key2 = 'KEY_TWO'
    const val2 = 'val2'
    core.getInput.mockImplementation((name) => {
      if (name === 'project_id') return MOCK_PROJECT_ID
      // Note the extra spaces and trailing/leading commas/empty segments
      if (name === 'secrets') return `  ${key1} = ${val1}  , ,, ${key2}=${val2}, `
      return ''
    })

    // Setup: Simulate both secrets not found
    mockGetSecret.mockRejectedValue({ code: 5 })
    // Setup: createSecret and addSecretVersion resolve (default beforeEach is fine)

    await run()

    // Verify creation calls reflect trimmed keys/values
    expect(mockCreateSecret).toHaveBeenCalledTimes(2)
    expect(mockCreateSecret).toHaveBeenCalledWith(expect.objectContaining({ secretId: key1 }))
    expect(mockCreateSecret).toHaveBeenCalledWith(expect.objectContaining({ secretId: key2 }))
    expect(mockAddSecretVersion).toHaveBeenCalledTimes(2)
    expect(mockAddSecretVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        parent: expect.stringContaining(key1),
        payload: { data: Buffer.from(val1, 'utf8') }
      })
    )
    expect(mockAddSecretVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        parent: expect.stringContaining(key2),
        payload: { data: Buffer.from(val2, 'utf8') }
      })
    )

    // Verify output includes both keys
    expect(core.setOutput).toHaveBeenCalledWith('updated_secrets', [key1, key2])
    expect(core.setFailed).not.toHaveBeenCalled()
  })

  it('should call setFailed if createSecret fails', async () => {
    const secretKey = 'FAIL_CREATE'
    const secretValue = 'fail_create_value'
    core.getInput.mockImplementation((name) => {
      if (name === 'project_id') return MOCK_PROJECT_ID
      if (name === 'secrets') return `${secretKey}=${secretValue}`
      return ''
    })

    // Setup: getSecret rejects with NOT_FOUND (default)
    mockGetSecret.mockRejectedValue({ code: 5 })
    // Setup: createSecret rejects
    const errorMessage = 'API Error during creation'
    mockCreateSecret.mockRejectedValue(new Error(errorMessage))
    // The catch block logic: secretExists is false.
    // Expected message format based on run.js:
    const expectedFailureMessage = `Error creating secret ${secretKey} or adding initial version: ${errorMessage}`

    await run()

    expect(core.setFailed).toHaveBeenCalledWith(expectedFailureMessage)
    expect(core.setOutput).not.toHaveBeenCalled()
  })

  it('should call setFailed for invalid input format (empty key)', async () => {
    core.getInput.mockImplementation((name) => {
      if (name === 'project_id') return MOCK_PROJECT_ID
      // Input with an empty key part after trimming
      if (name === 'secrets') return `validKey=val1, =emptyKeyVal`
      return ''
    })

    const expectedFailureMessage = 'Invalid secrets format: Found an entry with an empty key.'

    await run()

    // Verify setFailed was called with the specific validation message
    expect(core.setFailed).toHaveBeenCalledWith(expectedFailureMessage)
    // Verify no client calls were made
    expect(mockGetSecret).not.toHaveBeenCalled()
    expect(mockCreateSecret).not.toHaveBeenCalled()
    expect(mockAddSecretVersion).not.toHaveBeenCalled()
    expect(core.setOutput).not.toHaveBeenCalled()
  })
})

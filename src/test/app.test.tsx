import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import App from '../App'
import { AppProvider } from '../state/AppContext'
import { clearArchiveDatabase } from '../lib/db/database'

beforeEach(async () => {
  await clearArchiveDatabase()
})

describe('application shell', () => {
  it('boots into the local-first welcome screen and opens the importer', async () => {
    const user = userEvent.setup()
    render(
      <AppProvider>
        <App />
      </AppProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('Your conversations,')).toBeInTheDocument()
    })
    expect(screen.getByText('100% local · no login · no upload')).toBeInTheDocument()
    expect(screen.getByText('Nothing')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /import archive/i }))
    expect(await screen.findByText('Import Instagram archive')).toBeInTheDocument()
    expect(screen.getByText(/Drop your extracted archive here/i)).toBeInTheDocument()
  })

  it('opens settings without an archive and exposes local data controls', async () => {
    const user = userEvent.setup()
    render(
      <AppProvider>
        <App />
      </AppProvider>,
    )

    await screen.findByText('Your conversations,')
    await user.click(screen.getByRole('button', { name: 'Settings' }))
    expect(await screen.findByText('Settings & storage')).toBeInTheDocument()
    expect(screen.getByText('Local storage')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /clear all data/i })).toBeInTheDocument()
  })

  it('imports selected JSON, keeps the summary open, and opens the archive', async () => {
    const user = userEvent.setup()
    render(
      <AppProvider>
        <App />
      </AppProvider>,
    )

    await screen.findByText('Your conversations,')
    const importButton = screen.getAllByRole('button', { name: /import archive/i })[0]
    await user.click(importButton as HTMLElement)

    const personalInfo = new File(
      [
        JSON.stringify({
          profile_user: [
            { string_map_data: { Username: { value: 'me_user', timestamp: 0 } } },
          ],
        }),
      ],
      'personal_information.json',
      { type: 'application/json' },
    )
    const messages = new File(
      [
        JSON.stringify({
          participants: [{ name: 'alice' }, { name: 'me_user' }],
          title: 'alice',
          thread_path: 'inbox/alice_123/',
          messages: [
            { sender_name: 'alice', timestamp_ms: 3, content: 'newest synthetic' },
            { sender_name: 'me_user', timestamp_ms: 2, content: 'middle synthetic' },
            { sender_name: 'alice', timestamp_ms: 1, content: 'oldest synthetic' },
          ],
        }),
      ],
      'message_1.json',
      { type: 'application/json' },
    )

    const fileInput = document.querySelector<HTMLInputElement>(
      'input[accept=".json,application/json"]',
    )
    expect(fileInput).not.toBeNull()
    fireEvent.change(fileInput as HTMLInputElement, {
      target: { files: [personalInfo, messages] },
    })

    expect(await screen.findByText('Import complete', {}, { timeout: 8_000 })).toBeInTheDocument()
    expect(screen.getByText(/3 messages indexed/i)).toBeInTheDocument()
    expect(screen.getAllByText(/@me_user/i).length).toBeGreaterThan(0)

    await user.click(screen.getByRole('button', { name: /start at the beginning/i }))

    await waitFor(() => {
      expect(screen.getByText(/Read-only local archive/i)).toBeInTheDocument()
    })
    expect(screen.getAllByText('alice').length).toBeGreaterThan(0)
  })
})

import type { ArchiveInputFile } from '../../types'

export function mojibake(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let output = ''
  for (const byte of bytes) output += String.fromCharCode(byte)
  return output
}

function file(path: string, value: unknown): ArchiveInputFile {
  return { path, text: JSON.stringify(value) }
}

const participants = [{ name: 'alice' }, { name: 'me_user' }]
const groupParticipants = [{ name: 'alice' }, { name: 'me_user' }, { name: 'bob' }]

export interface SyntheticArchive {
  files: ArchiveInputFile[]
  root: string
}

export function buildSyntheticArchive(): SyntheticArchive {
  const root = 'instagram-me_user-2025-07-31-abc123'
  const threadA = `${root}/your_instagram_activity/messages/inbox/alice_1234567890123`
  const threadB = `${root}/your_instagram_activity/messages/inbox/alice_and_bob_1234567890999`
  const threadC = `${root}/your_instagram_activity/messages/inbox/empty_7777777777777`
  const requests = `${root}/your_instagram_activity/messages/message_requests/stranger_5555555555555`

  const files: ArchiveInputFile[] = [
    {
      path: `${root}/personal_information/personal_information/personal_information.json`,
      text: JSON.stringify({
        profile_user: [
          {
            title: 'User Information',
            string_map_data: {
              Username: { value: 'me_user', timestamp: 0 },
              Name: { value: 'Synthetic Me', timestamp: 0 },
            },
          },
        ],
      }),
    },
    file(`${threadA}/message_1.json`, {
      participants,
      title: 'alice',
      is_still_participant: true,
      thread_path: 'inbox/alice_1234567890123/',
      messages: [
        {
          sender_name: 'alice',
          timestamp_ms: 5000,
          content: 'See you tomorrow',
          reactions: [{ reaction: '❤️', actor: 'me_user', timestamp: 5100 }],
        },
        {
          sender_name: 'me_user',
          timestamp_ms: 4000,
          content: mojibake('café ☕ 😊'),
          is_geoblocked_for_viewer: false,
        },
        {
          sender_name: 'alice',
          timestamp_ms: 3000,
          photos: [
            {
              uri: 'your_instagram_activity/messages/inbox/alice_1234567890123/photos/photo_a.jpg',
              creation_timestamp: 3,
            },
          ],
          is_geoblocked_for_viewer: false,
        },
        {
          sender_name: 'me_user',
          timestamp_ms: 2500,
          is_unsent: true,
        },
        {
          sender_name: 'alice',
          timestamp_ms: 2000,
          content: 'alice sent an attachment.',
          share: {
            link: 'https://www.instagram.com/reel/SYNTHETIC/',
            share_text: 'Check this reel',
            original_content_owner: 'creator',
          },
        },
      ],
    }),
    file(`${threadA}/message_2.json`, {
      participants,
      title: 'alice',
      is_still_participant: true,
      thread_path: 'inbox/alice_1234567890123/',
      messages: [
        // Overlaps with message_1; must be removed.
        {
          sender_name: 'alice',
          timestamp_ms: 2000,
          content: 'alice sent an attachment.',
          share: {
            link: 'https://www.instagram.com/reel/SYNTHETIC/',
            share_text: 'Check this reel',
            original_content_owner: 'creator',
          },
        },
        {
          sender_name: 'me_user',
          timestamp_ms: 1500,
          content: 'line one\nline two',
        },
        {
          sender_name: 'alice',
          timestamp_ms: 1000,
          audio_files: [
            {
              uri: 'your_instagram_activity/messages/inbox/alice_1234567890123/audio/voice_1.mp4',
              creation_timestamp: 1,
            },
          ],
        },
        {
          sender_name: 'alice',
          timestamp_ms: 500,
          call_duration: 65,
          is_geoblocked_for_viewer: false,
        },
        {
          sender_name: 'me_user',
          timestamp_ms: 100,
          is_unsent_image_by_messenger_kid_parent: true,
        },
      ],
    }),
    file(`${threadB}/message_1.json`, {
      participants: groupParticipants,
      title: 'Weekend plans',
      is_still_participant: true,
      thread_path: 'inbox/alice_and_bob_1234567890999/',
      messages: [
        { sender_name: 'bob', timestamp_ms: 9000, content: 'Same timestamp B' },
        { sender_name: 'alice', timestamp_ms: 9000, content: 'Same timestamp A' },
        { sender_name: 'me_user', timestamp_ms: 8000, content: 'Group message' },
      ],
    }),
    file(`${threadC}/message_1.json`, {
      participants,
      title: 'empty',
      is_still_participant: true,
      thread_path: 'inbox/empty_7777777777777/',
      messages: [],
    }),
    file(`${requests}/message_1.json`, {
      participants: [{ name: 'stranger' }, { name: 'me_user' }],
      title: 'stranger',
      thread_path: 'message_requests/stranger_5555555555555/',
      messages: [{ sender_name: 'stranger', timestamp_ms: 7000, content: 'Request hello' }],
    }),
    {
      path: `${root}/your_instagram_activity/messages/inbox/broken_8888888888888/message_1.json`,
      text: '{ this is not valid json',
    },
    {
      // Noise that must be ignored.
      path: `${root}/your_instagram_activity/messages/inbox/noise_1.json`,
      text: JSON.stringify({ messages: [] }),
    },
  ]

  return { files, root }
}

export function buildTinyArchive(): ArchiveInputFile[] {
  return [
    file('messages/inbox/alice_111/message_1.json', {
      participants: [{ name: 'alice' }, { name: 'me_user' }],
      title: 'alice',
      thread_path: 'inbox/alice_111/',
      messages: [
        { sender_name: 'alice', timestamp_ms: 3, content: 'hi' },
        { sender_name: 'me_user', timestamp_ms: 2, content: 'hello' },
        { sender_name: 'alice', timestamp_ms: 1, content: 'first' },
      ],
    }),
    file('messages/inbox/bob_222/message_1.json', {
      participants: [{ name: 'bob' }, { name: 'me_user' }],
      title: 'bob',
      thread_path: 'inbox/bob_222/',
      messages: [{ sender_name: 'bob', timestamp_ms: 4, content: 'yo' }],
    }),
  ]
}

export function buildLargeArchive(count: number): ArchiveInputFile[] {
  const messages: unknown[] = []
  for (let index = count - 1; index >= 0; index--) {
    messages.push({
      sender_name: index % 3 === 0 ? 'me_user' : 'alice',
      timestamp_ms: 1_600_000_000_000 + index * 1000,
      content:
        index === 0
          ? 'the absolute first message'
          : index === count - 1
            ? 'the absolute newest message'
            : `synthetic message ${index} café`,
    })
  }
  return [
    file('messages/inbox/large_999/message_1.json', {
      participants: [{ name: 'alice' }, { name: 'me_user' }],
      title: 'alice',
      thread_path: 'inbox/large_999/',
      messages,
    }),
  ]
}

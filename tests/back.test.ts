import { describe, expect, test } from 'bun:test'
import { runBack, type BackActions } from '../src/lib/back'

function harness(overrides: Partial<BackActions> = {}) {
  const calls: string[] = []
  const actions: BackActions = {
    promptOpen: false,
    view: 'library',
    closePrompt: () => calls.push('closePrompt'),
    readerBack: () => (calls.push('readerBack'), false),
    shelfBack: () => (calls.push('shelfBack'), false),
    goShelf: () => calls.push('goShelf'),
    askExit: () => calls.push('askExit'),
    ...overrides,
  }
  return { calls, run: () => runBack(actions) }
}

describe('back stack', () => {
  test('open prompt is the first thing closed, and never quits', () => {
    const { calls, run } = harness({ promptOpen: true, view: 'library' })
    run()
    expect(calls).toEqual(['closePrompt'])
  })

  test('reader closes its own overlay before leaving', () => {
    const { calls, run } = harness({ view: 'reader', readerBack: () => (calls.push('readerBack'), true) })
    run()
    expect(calls).toEqual(['readerBack'])
  })

  test('reader returns to the shelf when it has nothing to close', () => {
    const { calls, run } = harness({ view: 'reader' })
    run()
    expect(calls).toEqual(['readerBack', 'goShelf'])
  })

  test('settings returns to the shelf', () => {
    const { calls, run } = harness({ view: 'settings' })
    run()
    expect(calls).toEqual(['goShelf'])
  })

  test('shelf closes its document sheet before asking to quit', () => {
    const { calls, run } = harness({ shelfBack: () => (calls.push('shelfBack'), true) })
    run()
    expect(calls).toEqual(['shelfBack'])
  })

  test('shelf asks for confirmation instead of exiting', () => {
    const { calls, run } = harness()
    run()
    expect(calls).toEqual(['shelfBack', 'askExit'])
  })
})

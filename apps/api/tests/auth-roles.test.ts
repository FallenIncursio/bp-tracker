import { describe, expect, it } from 'vitest'
import { canSetClanRole } from '../src/auth/roles.js'

describe('canSetClanRole', () => {
  it('allows global admins to assign any clan role', () => {
    expect(canSetClanRole('ADMIN', 'ADMIRAL')).toBe(true)
    expect(canSetClanRole('ADMIN', 'COMMANDER')).toBe(true)
    expect(canSetClanRole('ADMIN', 'LIEUTENANT')).toBe(true)
    expect(canSetClanRole('ADMIN', 'MEMBER')).toBe(true)
  })

  it('allows admirals to assign commander, lieutenant and member but not admiral', () => {
    expect(canSetClanRole('ADMIRAL', 'COMMANDER')).toBe(true)
    expect(canSetClanRole('ADMIRAL', 'LIEUTENANT')).toBe(true)
    expect(canSetClanRole('ADMIRAL', 'MEMBER')).toBe(true)
    expect(canSetClanRole('ADMIRAL', 'ADMIRAL')).toBe(false)
  })

  it('does not allow commanders or anonymous users to assign roles directly', () => {
    expect(canSetClanRole('COMMANDER', 'MEMBER')).toBe(false)
    expect(canSetClanRole(null, 'MEMBER')).toBe(false)
  })
})

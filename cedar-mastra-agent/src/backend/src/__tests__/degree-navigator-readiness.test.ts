import { describe, it } from 'node:test';
import assert from 'node:assert';

import {
  classifyDegreeNavigatorReadiness,
  isTransientDegreeNavigatorReadinessError,
} from '../browser/browserService.js';

describe('Degree Navigator readiness classifier', () => {
  it('treats Rutgers SSO pages as awaiting login', () => {
    const readiness = classifyDegreeNavigatorReadiness({
      url: 'https://cas.rutgers.edu/login?service=https%3A%2F%2Fdn.rutgers.edu%2F',
      title: 'Rutgers Central Authentication Service',
    });

    assert.strictEqual(readiness.readiness, 'awaiting_login');
    assert.strictEqual(readiness.urlHost, 'cas.rutgers.edu');
  });

  it('does not mark Degree Navigator host ready without post-login markers', () => {
    const readiness = classifyDegreeNavigatorReadiness({
      url: 'https://dn.rutgers.edu/',
      title: 'Degree Navigator',
      hasPostLoginMarker: false,
    });

    assert.strictEqual(readiness.readiness, 'awaiting_login');
    assert.strictEqual(readiness.urlHost, 'dn.rutgers.edu');
  });

  it('marks Degree Navigator ready when post-login markers are present', () => {
    const readiness = classifyDegreeNavigatorReadiness({
      url: 'https://degree-navigator.rutgers.edu/audit',
      title: 'Degree Navigator',
      hasPostLoginMarker: true,
    });

    assert.strictEqual(readiness.readiness, 'ready');
    assert.strictEqual(readiness.urlHost, 'degree-navigator.rutgers.edu');
  });

  it('returns unknown for unrelated pages', () => {
    const readiness = classifyDegreeNavigatorReadiness({
      url: 'https://example.com/',
      title: 'Example',
      hasPostLoginMarker: true,
    });

    assert.strictEqual(readiness.readiness, 'unknown');
    assert.strictEqual(readiness.urlHost, 'example.com');
  });

  it('treats Playwright navigation races as transient readiness errors', () => {
    assert.strictEqual(
      isTransientDegreeNavigatorReadinessError(
        new Error('page.evaluate: Execution context was destroyed, most likely because of a navigation'),
      ),
      true,
    );
    assert.strictEqual(
      isTransientDegreeNavigatorReadinessError(new Error('Protocol error: Cannot find context with specified id')),
      true,
    );
  });

  it('does not treat unrelated provider failures as transient readiness errors', () => {
    assert.strictEqual(
      isTransientDegreeNavigatorReadinessError(new Error('Browserbase credentials are missing.')),
      false,
    );
  });
});

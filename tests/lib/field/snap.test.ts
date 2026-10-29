import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  contactBetween,
  contactsWithFrame,
  type FrameSpec,
} from '@lib/field/geometry';
import { type SnapEnv, snapTo } from '@lib/field/snap';

import { makeBody } from '../../support/body';

const frame: FrameSpec = { w: 1000, h: 600, border: 4, screenRadius: 10 };
const env: SnapEnv = { frame, reach: 44 };

const body = makeBody(180);

const near = (a: number, b: number, eps = 0.05) => Math.abs(a - b) <= eps;

describe('snapTo', () => {
  describe('snapping', () => {
    test('wall: the window is pulled flush against the inner edge', () => {
      assert.deepEqual(snapTo(env, body(10, 250)), { x: 4, y: 250 });
    });

    test('side: the window joins side by side', () => {
      const other = body(100, 100, 200, 100);
      assert.deepEqual(snapTo(env, body(310, 100), [other]), {
        x: 300,
        y: 100,
      });
    });

    test('diagonal: touch by rounded corners', () => {
      const other = body(100, 100, 200, 100);
      const result = snapTo(env, body(320, 220), [other]);

      assert.ok(result);
      assert.ok(near(result.x, 292.97));
      assert.ok(near(result.y, 192.97));
    });

    test('a closed hover lip is a full-fledged magnet neighbor', () => {
      // A thin lip at the top edge: Float must not snap to the frame
      // "through" it and land on top. This is a deliberate decision, not a bug.
      const lip = body(400, 4, 420, 6);
      const self = body(500, 20, 180, 100);

      assert.deepEqual(snapTo(env, self, [lip]), { x: 500, y: 10 });
    });

    test('snapReach boundary: at reach it pulls, beyond it does not', () => {
      assert.deepEqual(snapTo(env, body(48, 250)), { x: 4, y: 250 });
      assert.equal(snapTo(env, body(49, 250)), null);
    });

    test('frame corner: two walls are closed as a pair', () => {
      assert.deepEqual(snapTo(env, body(48, 48)), { x: 4, y: 4 });
    });

    test('pair of wall + window side', () => {
      const other = body(100, 4, 200, 100);
      assert.deepEqual(snapTo(env, body(310, 14), [other]), {
        x: 300,
        y: 4,
      });
    });

    test('body order does not affect the result', () => {
      const a = body(100, 100, 200, 100);
      const b = body(100, 300, 200, 100);
      const self = body(320, 220);

      assert.deepEqual(snapTo(env, self, [a, b]), snapTo(env, self, [b, a]));
    });
  });

  describe('conflicts', () => {
    test('third body: a candidate with an intersection is discarded', () => {
      const c = body(10, 40, 30, 30);
      const result = snapTo(env, body(48, 48), [c]);

      assert.ok(result);

      const moved = body(result.x, result.y);
      const contact = contactBetween(moved, c);

      assert.ok(contact && contact.gap >= -0.01, 'intersects the third body');
      assert.ok(
        contactsWithFrame(moved, env.frame).every((item) => item.gap >= -0.01),
        'climbed into the frame material',
      );
      // The "left + top" pair (4, 4) intersects C and is discarded; the shorter
      // snap to the third body wins.
      assert.notDeepEqual(result, { x: 4, y: 4 });
    });

    test('push out: partial overlap along the normal', () => {
      const other = body(100, 100, 200, 100);
      const result = snapTo(env, body(290, 120), [other]);

      assert.ok(result);
      assert.ok(near(result.x, 300, 0.2));
      assert.ok(near(result.y, 120, 0.2));

      const contact = contactBetween(body(result.x, result.y), other);
      assert.ok(contact && contact.gap >= -0.01);
    });

    test('push out: deep overlap along an axis', () => {
      const other = body(100, 100, 200, 100);
      const result = snapTo(env, body(150, 120), [other]);

      assert.ok(result);
      assert.ok(near(result.y, 200.5, 0.6));

      const contact = contactBetween(body(result.x, result.y), other);
      assert.ok(contact && contact.gap >= -0.01);
    });
  });

  describe('frame penetration', () => {
    test('deep penetration into a thin frame: pushing inward', () => {
      assert.deepEqual(snapTo(env, body(0, 250, 180, 100, 4)), {
        x: 4,
        y: 250,
      });
    });

    test('deep penetration into a thick frame: pushing inward', () => {
      const thick: SnapEnv = { frame: { ...frame, border: 20 }, reach: 44 };

      assert.deepEqual(snapTo(thick, body(0, 250, 180, 100, 12)), {
        x: 20,
        y: 250,
      });
      assert.deepEqual(snapTo(thick, body(8, 250, 180, 100, 12)), {
        x: 20,
        y: 250,
      });
    });
  });

  describe('geometry edges', () => {
    test('windowRadius = 0: windows join flush', () => {
      const other = body(100, 100, 200, 100, 0);

      assert.deepEqual(snapTo(env, body(310, 100, 180, 100, 0), [other]), {
        x: 300,
        y: 100,
      });
    });

    test('symmetry: the same gap on all four walls', () => {
      const gap = 6;

      assert.deepEqual(snapTo(env, body(4 + gap, 250)), { x: 4, y: 250 });
      assert.deepEqual(snapTo(env, body(816 - gap, 250)), { x: 816, y: 250 });
      assert.deepEqual(snapTo(env, body(400, 4 + gap)), { x: 400, y: 4 });
      assert.deepEqual(snapTo(env, body(400, 496 - gap)), { x: 400, y: 496 });
    });

    test('equal distance: the choice by key does not depend on body order', () => {
      const left = body(260, 250);
      const right = body(640, 250);
      const self = body(450, 250);

      assert.deepEqual(snapTo(env, self, [right, left]), { x: 440, y: 250 });
      assert.deepEqual(snapTo(env, self, [left, right]), { x: 440, y: 250 });
    });

    test('nearly parallel normals: a single contact is chosen', () => {
      const a = body(200, 250, 180, 100);
      const b = body(200, 379, 190, 100);
      const result = snapTo(env, body(400, 300), [a, b]);

      assert.ok(result);
      assert.ok(near(result.x, 389.907, 0.05));
      assert.ok(near(result.y, 300.891, 0.05));

      for (const other of [a, b]) {
        const contact = contactBetween(body(result.x, result.y), other);
        assert.ok(contact && contact.gap >= -0.01);
      }
    });

    test('a corner with a small windowRadius does not climb into the frame', () => {
      const result = snapTo(env, body(4, 4, 100, 100, 4));

      assert.ok(result);
      assert.ok(
        contactsWithFrame(
          body(result.x, result.y, 100, 100, 4),
          env.frame,
        ).every((item) => item.gap >= -0.01),
      );
    });
  });
});

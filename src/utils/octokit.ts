import * as core from '@actions/core';
import { GitHub, getOctokitOptions } from '@actions/github/lib/utils';
import { throttling } from '@octokit/plugin-throttling';

import { ActionData, Octokit, OctokitOptions, OctokitPlugin } from '../types';
import { SerializerOctokitPlugin } from './SerializerOctokitPlugin';
import { SERIALIZED_ROUTES } from '../constants';

const Octokit = GitHub.plugin(
  // octokit client type doesnt match up but is valid
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (SerializerOctokitPlugin as any) as OctokitPlugin,
  throttling,
);

const THROTTLE_OPTIONS = {
  onRateLimit: (
    retryAfter: number,
    options: OctokitOptions,
    client: Octokit,
  ) => {
    client.log.warn(
      `[THROTTLER] | Request quota exhausted for request ${options.method} ${options.url}`,
    );

    if (options.request?.retryCount < 1) {
      // only retries twice
      client.log.info(`[THROTTLER] | Retrying after ${retryAfter} seconds!`);
      return true;
    }
  },
  onAbuseLimit: (
    retryAfter: number,
    options: OctokitOptions,
    client: Octokit,
  ) => {
    // does not retry, only logs a warning
    client.log.warn(
      `[THROTTLER] | Abuse detected for request ${options.method} ${options.url}`,
    );
  },
};

export function getOctokitClient(data: ActionData): Octokit {
  return new Octokit(
    getOctokitOptions(core.getInput('github-token', { required: true }), {
      throttle: THROTTLE_OPTIONS,
      serializer: {
        enabled: data.eventName === 'schedule' || data.isReadOnly,
        deserialize: data.eventName === 'schedule',
        data,
        routes: SERIALIZED_ROUTES,
      },
    }),
  );
}

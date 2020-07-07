import {
  OctokitPlugin,
  OctokitRequestOptions,
  RequestDescriptor,
  ActionData,
} from '../../types';

import { requestRouteMatcher } from './routeMatcher';
import { Serializers } from './serialize';

type RunArtifact = { data: any; requests: Set<[string, RequestDescriptor]> };

const ARTIFACTS = new Set<RunArtifact>();

export const SerializerOctokitPlugin: OctokitPlugin = (
  octokit: Parameters<OctokitPlugin>[0],
  clientOptions: Parameters<OctokitPlugin>[1],
) => {
  console.log('[SerializerOctokitPlugin] | Plugin Called: ', clientOptions);

  const { data }: { data: ActionData } = clientOptions.serializer;

  const match = clientOptions.serializer.routes
    ? requestRouteMatcher(clientOptions.serializer.routes)
    : undefined;

  if (
    clientOptions.serializer.enabled !== false &&
    clientOptions.serializer.deserialize !== true
  ) {
    const artifact: RunArtifact = {
      data: clientOptions.serializer,
      requests: new Set(),
    };

    ARTIFACTS.add(artifact);

    octokit.hook.wrap(
      'request',
      async (
        request,
        requestOptions: OctokitRequestOptions,
      ): Promise<unknown> => {
        const isMatched = !match || match.test(requestOptions.url);
        console.log(
          '[SerializerOctokitPlugin] | Request | ',
          JSON.stringify(
            {
              ...requestOptions,
              request: undefined,
              isMatched,
            },
            null,
            2,
          ),
        );
        if (isMatched) {
          const serializer = Serializers.get(requestOptions.url);

          if (!serializer) {
            throw new Error(
              '[SerializerOctokitPlugin] | Attempted to serialize a path that is not handled',
            );
          }

          const serializeResult = await serializer.serialize(
            data,
            requestOptions,
          );

          console.log(
            'Serialize Result: ',
            JSON.stringify(serializeResult, null, 2),
          );

          artifact.requests.add([requestOptions.url, serializeResult]);

          return serializeResult.result;
          // temp actually make requests
        }
        return request(requestOptions);
      },
    );
  }

  return {
    /**
     * Returns the serialized artifacts that can be uploaded to github artifacts
     */
    getSerializedArtifacts(): string {
      return JSON.stringify(
        [...ARTIFACTS].map((artifact) =>
          JSON.stringify({
            data: artifact.data,
            requests: Array.from(artifact.requests),
          }),
        ),
      );
    },
    async deserializeArtifacts(artifacts: string[]) {
      // each file we receive will be included so each iteration here will be
      // a separate PR's serialized artifacts
      for (const issueArtifactsString of artifacts) {
        const issueArtifacts = JSON.parse(issueArtifactsString);
        for (const artifact of issueArtifacts) {
          const {
            data: { data },
            requests,
          }: Omit<RunArtifact, 'data'> & {
            data: { data: ActionData };
          } = JSON.parse(artifact);
          console.group(`Handling Issue ${data.issueNumber}`);
          for (const [route, descriptor] of requests) {
            console.log(
              '[SerializerOctokitPlugin] | Deserializing A Route: ',
              route,
              descriptor,
            );
            const serializer = Serializers.get(route);
            if (!serializer) {
              throw new Error(
                `[SerializerOctokitPlugin] | Attempted to deserialize a path "${route}" which is not handled`,
              );
            }
            await serializer.deserialize(data, descriptor, octokit);
            console.log('Success!');
            console.groupEnd();
          }
        }
      }
    },
  };
};

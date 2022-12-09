import Dict from '../../../Dict';
import Patch from '../../../util/Patch';
import Async from '../Async';
import Scene from '../Scene';
import PredicateCompletion from './PredicateCompletion';

interface ChallengeCompletion {
  scene: Patch<Scene>;
  events: Dict<boolean>;
  success?: PredicateCompletion;
  failure?: PredicateCompletion;
}

export interface ChallengeCompletionBrief {
}

export namespace ChallengeCompletionBrief {
}

export type AsyncChallengeCompletion = Async<ChallengeCompletionBrief, ChallengeCompletion>;

export namespace AsyncChallenge {
  export const unloaded = (brief: ChallengeCompletionBrief): AsyncChallengeCompletion => ({
    type: Async.Type.Unloaded,
    brief,
  });

  export const loaded = (challenge: ChallengeCompletion): AsyncChallengeCompletion => ({
    type: Async.Type.Loaded,
    brief: {
    },
    value: challenge,
  });
}

export default ChallengeCompletion;
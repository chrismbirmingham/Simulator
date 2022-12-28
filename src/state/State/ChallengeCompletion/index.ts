import Dict from '../../../Dict';
import Patch from '../../../util/Patch';
import Async from '../Async';
import Scene from '../Scene';
import PredicateCompletion from './PredicateCompletion';

import { ObjectPatch, OuterObjectPatch } from 'symmetry';
import ProgrammingLanguage from '../../../ProgrammingLanguage';

interface ChallengeCompletion {
  code: { [language in ProgrammingLanguage]: string };
  currentLanguage: ProgrammingLanguage;
  sceneDiff: OuterObjectPatch<Scene>;
  eventStates: Dict<boolean>;
  success?: PredicateCompletion;
  failure?: PredicateCompletion;
}

namespace ChallengeCompletion {
  export const EMPTY: ChallengeCompletion = {
    code: {
      'c': '',
      'cpp': '',
      'python': '',
    },
    currentLanguage: 'c',
    sceneDiff: { t: 'o' },
    eventStates: {},
  };
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
import Scene from "../state/State/Scene";
import LocalizedString from '../util/LocalizedString';

import { createBaseSceneSurfaceA } from './jbcBase';

import tr from '@i18n';

const baseScene = createBaseSceneSurfaceA();

export const JBC_8B: Scene = {
  ...baseScene,
  name: tr('JBC 8B'),
  description: tr('Junior Botball Challenge 8B: Serpentine Jr.'),
};
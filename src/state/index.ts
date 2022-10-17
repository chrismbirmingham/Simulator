import { combineReducers, createStore,  } from 'redux';

import * as reducer from './reducer';
import { Robots, Scenes } from './State';
import { connectRouter, RouterState } from 'connected-react-router';
import history from './history';


// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
const global = window as any;

/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
export default createStore(combineReducers<State>({
  scenes: reducer.reduceScenes,
  robots: reducer.reduceRobots,
  router: connectRouter(history),
}), global.__REDUX_DEVTOOLS_EXTENSION__ && global.__REDUX_DEVTOOLS_EXTENSION__());
/* eslint-enable @typescript-eslint/no-unsafe-call */
/* eslint-enable @typescript-eslint/no-unsafe-member-access */

export interface State {
  scenes: Scenes;
  robots: Robots;
  router: RouterState;
}
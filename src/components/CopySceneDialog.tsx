import * as React from 'react';
import { styled } from 'styletron-react';
import { StyleProps } from '../style';
import { Dialog } from './Dialog';
import { ThemeProps } from './theme';
import { Fa } from './Fa';
import Scene from '../state/State/Scene';
import SceneSettings from './SceneSettings';
import DialogBar from './DialogBar';
import { faPlus } from '@fortawesome/free-solid-svg-icons';
import deepNeq from '../deepNeq';

export interface CopySceneDialogProps extends ThemeProps, StyleProps {
  scene: Scene;

  onClose: () => void;
  onAccept: (scene: Scene) => void;
}

interface CopySceneDialogState {
  scene: Scene;
}

type Props = CopySceneDialogProps;
type State = CopySceneDialogState;

const StyledSceneSettings = styled(SceneSettings, ({ theme }: ThemeProps) => ({
  color: theme.color,
  padding: `${theme.itemPadding * 2}px`, 
}));

class CopySceneDialog extends React.PureComponent<Props, State> {
  constructor(props: Props) {
    super(props);

    this.state = {
      scene: props.scene,
    };
  }

  componentDidUpdate(prevProps: Readonly<CopySceneDialogProps>, prevState: Readonly<CopySceneDialogState>): void {
    if (deepNeq(prevProps.scene.name, this.props.scene.name) || deepNeq(prevProps.scene.description, this.props.scene.description)) {
      this.setState({ scene: this.props.scene });
    }
  }

  private onSceneChange_ = (scene: Scene) => this.setState({ scene });

  private onAccept_ = () => this.props.onAccept(this.state.scene);

  render() {
    const { props, state } = this;
    const { theme, onClose, onAccept } = props;
    const { scene } = state;

    return (
      <Dialog theme={theme} name='Copy World' onClose={onClose}>
        <StyledSceneSettings
          scene={scene}
          onSceneChange={this.onSceneChange_}
          theme={theme}
        />
        <DialogBar theme={theme} onAccept={this.onAccept_}><Fa icon={faPlus} /> Create</DialogBar>
      </Dialog>
    );
  }
}

export default CopySceneDialog;
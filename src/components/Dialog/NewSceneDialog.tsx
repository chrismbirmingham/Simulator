import * as React from 'react';
import { styled } from 'styletron-react';
import { StyleProps } from '../../util/style';
import { Dialog } from './Dialog';
import { ThemeProps } from '../constants/theme';
import { FontAwesome } from '../FontAwesome';
import Scene from '../../state/State/Scene';
import SceneSettings from '../World/SceneSettings';
import DialogBar from './DialogBar';
import { faPlus } from '@fortawesome/free-solid-svg-icons';

import tr from '@i18n';
import LocalizedString from '../../util/LocalizedString';
import { connect } from 'react-redux';

import { State as ReduxState } from '../../state';

export interface NewSceneDialogPublicProps extends ThemeProps, StyleProps {
  onClose: () => void;
  onAccept: (scene: Scene) => void;
}

interface NewSceneDialogPrivateProps {
  locale: LocalizedString.Language;
}

interface NewSceneDialogState {
  scene: Scene;
}

type Props = NewSceneDialogPublicProps & NewSceneDialogPrivateProps;
type State = NewSceneDialogState;

const StyledSceneSettings = styled(SceneSettings, ({ theme }: ThemeProps) => ({
  color: theme.color,
  padding: `${theme.itemPadding * 2}px`, 
}));

class NewSceneDialog extends React.PureComponent<Props, State> {
  constructor(props: Props) {
    super(props);

    this.state = {
      scene: Scene.EMPTY,
    };
  }

  private onSceneChange_ = (scene: Scene) => this.setState({ scene });

  private onAccept_ = () => this.props.onAccept(this.state.scene);

  render() {
    const { props, state } = this;
    const { theme, onClose, onAccept, locale } = props;
    const { scene } = state;

    return (
      <Dialog
        theme={theme}
        name={LocalizedString.lookup(tr('New World'), locale)}
        onClose={onClose}
      >
        <StyledSceneSettings
          scene={scene}
          onSceneChange={this.onSceneChange_}
          theme={theme}
        />
        <DialogBar theme={theme} onAccept={this.onAccept_}><FontAwesome icon={faPlus} /> {LocalizedString.lookup(tr('Create'), locale)}</DialogBar>
      </Dialog>
    );
  }
}

export default connect((state: ReduxState) => ({
  locale: state.i18n.locale,
}))(NewSceneDialog) as React.ComponentType<NewSceneDialogPublicProps>;
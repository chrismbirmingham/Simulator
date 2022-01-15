import * as React from "react";
import { styled } from "styletron-react";
import { Dialog } from "./Dialog";
import { ThemeProps } from "./theme";

export interface SelectSceneDialogProps extends ThemeProps {
  onClose: () => void;
}

interface ReduxSelectSceneDialog {

}

type Props = SelectSceneDialog;

const Container = styled('div', (props: ThemeProps) => ({
  display: 'flex',
  flexDirection: 'row',
}));

const SceneContainer = styled('div', (props: ThemeProps) => ({
  width: '300px',
  padding: `${props.theme.itemPadding * 2}px`
}));

const InfoContainer = styled('div', (props: ThemeProps) => ({
  borderLeft: `1px solid ${props.theme.borderColor}`,
  flex: '1 1',
  padding: `${props.theme.itemPadding * 2}px`
}));

class SelectSceneDialog extends React.PureComponent<Props> {
  render() {
    const { theme, onClose } = this.props;
    return (
      <Dialog name='Select Scene' theme={theme} onClose={onClose}>
        <Container theme={theme}>
          <SceneContainer theme={theme}>

          </SceneContainer>
          <InfoContainer theme={theme}>

          </InfoContainer>
        </Container>
      </Dialog>
    );
  }
}

export default SelectSceneDialog;
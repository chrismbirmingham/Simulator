import * as React from 'react';

import { styled } from 'styletron-react';
import DocumentationLocation from '../../state/State/Documentation/DocumentationLocation';
import FunctionDocumentationModel from '../../state/State/Documentation/FunctionDocumentation';
import { StyleProps } from '../../style';
import Section from '../Section';
import { ThemeProps } from '../theme';
import { ParameterName, Type } from './common';
import FunctionPrototype from './FunctionPrototype';

export interface FunctionDocumentationProps extends StyleProps, ThemeProps {
  func: FunctionDocumentationModel;

  onDocumentationPush: (location: DocumentationLocation) => void;
}

type Props = FunctionDocumentationProps;

const Container = styled('div', {
  width: '100%',
});

const StyledFunctionPrototype = styled(FunctionPrototype, ({ theme }: ThemeProps) => ({
  fontSize: '1.5em',
  padding: `${theme.itemPadding * 2}px`
}));

const BriefDescription = styled('p', ({ theme }: ThemeProps) => ({
  fontSize: '1.2em',
  padding: `${theme.itemPadding * 2}px`,
  margin: 0
}));

const ParameterContainer = styled('div', ({ theme }: ThemeProps) => ({
  marginBottom: `${theme.itemPadding}px`,
}));

const ParameterPrototype = styled('span', {
  fontSize: '1.2em',
});

const FunctionDocumentation = ({ func, style, className, theme }: Props) => {
  return (
    <Container className={className} style={style}>
      <StyledFunctionPrototype theme={theme} func={func} />
      {func.brief_description && (
        <BriefDescription theme={theme}>
          {func.brief_description}
        </BriefDescription>
      )}
      {func.detailed_description && (
        <Section name='Detailed Description' theme={theme}>
          {func.detailed_description}
        </Section>
      )}
      {func.parameters.length > 0 && (
        <Section name='Parameters' theme={theme}>
          {func.parameters.map((parameter, index) => (
            <ParameterContainer key={index} theme={theme}>
              <ParameterPrototype>
                <Type>{parameter.type}</Type>
                <ParameterName>{parameter.name}</ParameterName>
              </ParameterPrototype>
              {parameter.description && (
                <div>
                  {parameter.description}
                </div>
              )}
            </ParameterContainer>
          ))}
        </Section>
      )}
      {func.return_type !== 'void' && (
        <Section name='Return Value' theme={theme}>
          <ParameterPrototype>
            <Type>{func.return_type}</Type>
          </ParameterPrototype>
          {func.return_description && (
            <div>
              {func.return_description}
            </div>
          )}
        </Section>
      )}

    </Container>
  );
};

export default FunctionDocumentation;
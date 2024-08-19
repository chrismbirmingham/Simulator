import * as React from 'react';
import { styled } from 'styletron-react';
import { connect } from 'react-redux';

import { DARK, ThemeProps } from '../components/constants/theme';
import { Card } from '../components/interface/Card';
import MainMenu from '../components/MainMenu';

import { StyleProps } from '../util/style';
import LocalizedString from '../util/LocalizedString';

import { State as ReduxState } from '../state';
import tr from '@i18n';

import db from '../db';


interface Challenge {
  name: LocalizedString;
  description: LocalizedString;
  src?: string;
  backgroundColor?: string;
}

interface Score {
  name: LocalizedString;
  completed: boolean;
  score?: number;
  completionTime?: number;
}

interface User {
  id: string;
  name: string;
  scores: Score[];
  src?: string;
  backgroundColor?: string;
}

interface Leaderboard {
  challenges: Record<string, Challenge>;
  users: Record<string, User>;
  title?: string;
  description?: string;
  src?: string;
  backgroundColor?: string;
}

export interface LeaderboardPublicProps extends StyleProps, ThemeProps {
  users: Record<string, User>;
  challenges: Record<string, Challenge>;
}

interface LeaderboardPrivateProps {
  locale: LocalizedString.Language;
}

interface LeaderboardState {
  selected: string;
}

type Props = LeaderboardPublicProps & LeaderboardPrivateProps;
type State = LeaderboardState;

const PageContainer = styled('div', (props: ThemeProps) => ({
  width: '100%',
  height: '100%',
  backgroundColor: props.theme.backgroundColor,
  color: props.theme.color,
}));
  
const LeaderboardContainer = styled("div", (props: ThemeProps) => ({
  backgroundColor: props.theme.backgroundColor,
  width: 'calc(100vw - 2px)',
  height: 'calc(100vh - 48px)',
  display: 'flex',
  flexDirection: 'column',
  // alignItems: 'center',
  // justifyContent: 'center',
  overflow: 'auto',
  // border: '2px solid red',
}));

const LeaderboardTitleContainer = styled('div', {
  alignItems: 'center',
  justifyContent: 'center',
  display: 'flex',
  flexDirection: 'column',
  margin: '20px',
  // border: '2px solid blue',
});

const TableHeaderContainer = styled('div', {
  display: 'inline-block',
  transform: 'rotate(-45deg)', // Rotate the text by -45 degrees
  transformOrigin: 'bottom left', // Set the origin for the rotation
  whiteSpace: 'nowrap', // Prevent text wrapping
  width: '50px', // Set the width of the container
});

const Table = styled('table', {
  width: '80%',
  borderCollapse: 'collapse',
  marginTop: '50px',
  marginLeft: '20px',
  padding: '8px',
  // border: '2px solid green',
});

const TableHeader = styled('th', {
  borderBottom: '2px solid #ddd',
  padding: '8px',
  textAlign: 'left',
});

const TableRow = styled('tr', {
  borderBottom: '1px solid #ddd',
});

const TableCell = styled('td', {
  padding: '8px',
  textAlign: 'left',
});


class Leaderboard extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);

    this.state = {
      selected: '',
    };
  }

  private onLog = async () => {
    const res = await db.list('user');
    console.log(res);
  };
  private getDefaultChallenges = (): Record<string, Challenge> => {
    const challenges: Record<string, Challenge> = {};
    const suffixes = ['a', 'b', 'c'];
  
    for (let i = 1; i <= 12; i++) {
      suffixes.forEach((suffix) => {
        const id = `challenge${i}${suffix}`;
        challenges[id] = {
          name: tr(`JBC Challenge ${i}${suffix.toUpperCase()}`),
          description: tr(`Junior Botball Challenge ${i}${suffix.toUpperCase()}: Description for Challenge ${i}${suffix.toUpperCase()}`),
        };
      });
    }
  
    return challenges;
  };

  private getDefaultUsers = (): Record<string, User> => {
    const users: Record<string, User> = {};
    const challengeIds = Object.keys(this.getDefaultChallenges());
  
    for (let i = 1; i <= 20; i++) {
      const scores: Score[] = [];
      const numChallenges = Math.floor(Math.random() * 10) + 1; // Each user will complete between 1 and 5 challenges
      const completedChallenges = new Set<string>();
  
      while (completedChallenges.size < numChallenges) {
        const randomChallengeId = challengeIds[Math.floor(Math.random() * challengeIds.length)];
        if (!completedChallenges.has(randomChallengeId)) {
          completedChallenges.add(randomChallengeId);
          const score: Score = {
            name: this.getDefaultChallenges()[randomChallengeId].name,
            completed: true,
            score: Math.floor(Math.random() * 101), // Random score between 0 and 100
            completionTime: Math.floor(Math.random() * 301) + 100, // Random time between 100 and 400
          };
          scores.push(score);
        }
      }
  
      users[`user${i}`] = {
        id: `user${i}`,
        name: `User ${i}`,
        scores: scores,
      };
    }
  
    return users;
  };

  private orderUsersByCompletedChallenges = (users: Record<string, User>): User[] => {
    const userArray = Object.values(users);

    userArray.sort((a, b) => {
      const completedChallengesA = a.scores.filter(score => score.completed).length;
      const completedChallengesB = b.scores.filter(score => score.completed).length;

      return completedChallengesB - completedChallengesA;
    });

    return userArray;
  };
  
  private renderLeaderboard = () => {
    const users = this.props.users || this.getDefaultUsers();
    const sortedUsers = this.orderUsersByCompletedChallenges(users);
    const challenges = this.props.challenges || this.getDefaultChallenges();
  
    if (!sortedUsers) return null;
  
    const userArray = Object.values(sortedUsers);
    const challengeArray = Object.entries(challenges);
  
    return (
      <Table>
        <thead>
          <tr>
            <TableHeader>UserName</TableHeader>
            {challengeArray.map(([id,challenge]) => (
              <TableHeader key={id}>
                <TableHeaderContainer>
                  {challenge.name['en-US']}
                </TableHeaderContainer>
              </TableHeader>
            ))}
          </tr>
        </thead>
        <tbody>
          {userArray.map((user) => (
            <TableRow key={user.id}>
              <TableCell>{user.name}</TableCell>
              {challengeArray.map(([id,challenge]) => {
                const userScore = user.scores.find(score => score.name['en-US'] === challenge.name['en-US']);
                return (
                  <TableCell key={id}>
                    {userScore ? (
                      <>
                        <img src="/static/icons/favicon-32x32.png" alt="Favicon" />
                        {/* <div>Score: {userScore.score ?? '-'}</div>
                        <div>Time: {userScore.completionTime ?? '-'}</div> */}
                      </>
                    ) : (
                      '-'
                    )}
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </tbody>
      </Table>
    );
  };

  render() {
    const { props, state } = this;
    const { style, locale } = props;
    const { selected } = state;
    const theme = DARK;

    return (
      <PageContainer style={style} theme={theme}>
        <MainMenu theme={theme} />
        <LeaderboardContainer style={style} theme={theme}>
          <LeaderboardTitleContainer>
            <h1>KIPR All Time Leaderboard</h1>
          </LeaderboardTitleContainer>
          {this.renderLeaderboard()}
        </LeaderboardContainer>
        {/* <button onClick={this.onLog}>Log</button> */}
      </PageContainer>
    );
  }
}

export default connect((state: ReduxState) => ({
  locale: state.i18n.locale,
}))(Leaderboard) as React.ComponentType<LeaderboardPublicProps>;
import React from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './ChattingNowBadge.module.css';

// "Chatting now": this person has a website chat agent open and active right
// now. Clicking it opens the website chat conversations.
const ChattingNowBadge = ({ agentLabel, style }: { agentLabel?: string | null; style?: React.CSSProperties }) => {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      className={styles.badge}
      style={style}
      title={`Chatting with the website chat agent${agentLabel ? ` (${agentLabel})` : ''} right now. Click to see the conversation.`}
      onClick={(e) => { e.stopPropagation(); navigate('/outreach?tab=website'); }}
    >
      <span className={styles.dot} />
      Chatting now
    </button>
  );
};

export default ChattingNowBadge;

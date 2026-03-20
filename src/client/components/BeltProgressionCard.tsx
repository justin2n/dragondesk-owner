import React, { useState, useEffect } from 'react';
import styles from './BeltProgressionCard.module.css';

interface BeltProgress {
  member: {
    id: number;
    firstName: string;
    lastName: string;
    programType: string;
    currentRanking: string;
    lastPromotionAt: string | null;
    totalClassesAttended: number;
  };
  requirements: {
    id: number;
    programType: string;
    fromRanking: string;
    toRanking: string;
    minClassAttendance: number;
    minTimeInRankDays: number;
    requiredSkillCategories?: string;
    notes?: string;
  } | null;
  progress: {
    classesSincePromotion: number;
    classProgress: number;
    timeInRank: number;
    timeProgress: number;
    skillsProgress: {
      learned: number;
      required: number;
      skills: any[];
    };
  };
  readyForPromotion: boolean;
  nextRanking: string | null;
}

interface BeltProgressionCardProps {
  memberId: number;
  compact?: boolean;
}

const BeltProgressionCard: React.FC<BeltProgressionCardProps> = ({ memberId, compact = false }) => {
  const [data, setData] = useState<BeltProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadBeltProgress();
  }, [memberId]);

  const loadBeltProgress = async () => {
    try {
      const response = await fetch(`/api/attendance/belt-progress/${memberId}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to load belt progress');
      }

      const result = await response.json();
      setData(result);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className={`${styles.card} ${compact ? styles.compact : ''}`}>
        <div className={styles.loading}>Loading belt progress...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className={`${styles.card} ${compact ? styles.compact : ''}`}>
        <div className={styles.error}>{error || 'Unable to load belt progress'}</div>
      </div>
    );
  }

  const { member, requirements, progress, readyForPromotion, nextRanking } = data;

  const formatTimeInRank = (days: number) => {
    if (days < 30) return `${days} days`;
    const months = Math.floor(days / 30);
    return `${months} month${months !== 1 ? 's' : ''}`;
  };

  const getBeltColor = (ranking: string, program: string) => {
    const lowerRanking = ranking?.toLowerCase() || '';

    // BJJ colors
    if (program === 'BJJ') {
      if (lowerRanking.includes('white')) return '#f8f9fa';
      if (lowerRanking.includes('blue')) return '#3b82f6';
      if (lowerRanking.includes('purple')) return '#8b5cf6';
      if (lowerRanking.includes('brown')) return '#92400e';
      if (lowerRanking.includes('black')) return '#1a1a2e';
    }

    // Taekwondo colors
    if (program === 'Taekwondo') {
      if (lowerRanking.includes('white')) return '#f8f9fa';
      if (lowerRanking.includes('yellow')) return '#fbbf24';
      if (lowerRanking.includes('green')) return '#22c55e';
      if (lowerRanking.includes('blue')) return '#3b82f6';
      if (lowerRanking.includes('red')) return '#ef4444';
      if (lowerRanking.includes('black')) return '#1a1a2e';
    }

    // Muay Thai colors (typically uses armbands)
    if (program === 'Muay Thai') {
      if (lowerRanking.includes('white')) return '#f8f9fa';
      if (lowerRanking.includes('yellow')) return '#fbbf24';
      if (lowerRanking.includes('orange')) return '#f97316';
      if (lowerRanking.includes('green')) return '#22c55e';
      if (lowerRanking.includes('blue')) return '#3b82f6';
      if (lowerRanking.includes('red')) return '#ef4444';
      if (lowerRanking.includes('brown')) return '#92400e';
      if (lowerRanking.includes('black')) return '#1a1a2e';
    }

    return '#6b7280';
  };

  const currentBeltColor = getBeltColor(member.currentRanking, member.programType);
  const nextBeltColor = nextRanking ? getBeltColor(nextRanking, member.programType) : currentBeltColor;

  return (
    <div className={`${styles.card} ${compact ? styles.compact : ''}`}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.beltDisplay}>
          <div
            className={styles.beltIcon}
            style={{
              backgroundColor: currentBeltColor,
              border: currentBeltColor === '#f8f9fa' ? '2px solid #dee2e6' : 'none'
            }}
          />
          <div className={styles.beltInfo}>
            <span className={styles.currentRank}>{member.currentRanking || 'No Rank'}</span>
            <span className={styles.program}>{member.programType}</span>
          </div>
        </div>
        {readyForPromotion && (
          <div className={styles.readyBadge}>
            Ready for Promotion!
          </div>
        )}
      </div>

      {requirements ? (
        <>
          {/* Progress to Next Rank */}
          <div className={styles.progressSection}>
            <div className={styles.progressHeader}>
              <span>Progress to {nextRanking}</span>
              <div
                className={styles.nextBeltIcon}
                style={{
                  backgroundColor: nextBeltColor,
                  border: nextBeltColor === '#f8f9fa' ? '1px solid #dee2e6' : 'none'
                }}
              />
            </div>

            {/* Classes Progress */}
            <div className={styles.progressItem}>
              <div className={styles.progressLabel}>
                <span>Classes</span>
                <span>{progress.classesSincePromotion} / {requirements.minClassAttendance}</span>
              </div>
              <div className={styles.progressBar}>
                <div
                  className={styles.progressFill}
                  style={{ width: `${progress.classProgress}%` }}
                />
              </div>
            </div>

            {/* Time Progress */}
            <div className={styles.progressItem}>
              <div className={styles.progressLabel}>
                <span>Time in Rank</span>
                <span>
                  {formatTimeInRank(progress.timeInRank)} / {formatTimeInRank(requirements.minTimeInRankDays)}
                </span>
              </div>
              <div className={styles.progressBar}>
                <div
                  className={`${styles.progressFill} ${styles.timeFill}`}
                  style={{ width: `${progress.timeProgress}%` }}
                />
              </div>
            </div>

            {/* Skills Progress (if applicable) */}
            {progress.skillsProgress.required > 0 && (
              <div className={styles.progressItem}>
                <div className={styles.progressLabel}>
                  <span>Skills Mastered</span>
                  <span>{progress.skillsProgress.learned} / {progress.skillsProgress.required}</span>
                </div>
                <div className={styles.progressBar}>
                  <div
                    className={`${styles.progressFill} ${styles.skillsFill}`}
                    style={{
                      width: `${(progress.skillsProgress.learned / progress.skillsProgress.required) * 100}%`
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Requirements Notes */}
          {requirements.notes && !compact && (
            <div className={styles.notes}>
              <strong>Requirements:</strong> {requirements.notes}
            </div>
          )}
        </>
      ) : (
        <div className={styles.noRequirements}>
          {member.currentRanking?.toLowerCase().includes('black')
            ? 'Congratulations on achieving the highest rank!'
            : 'No progression requirements defined for current rank'}
        </div>
      )}

      {/* Stats */}
      {!compact && (
        <div className={styles.stats}>
          <div className={styles.statItem}>
            <span className={styles.statValue}>{member.totalClassesAttended || 0}</span>
            <span className={styles.statLabel}>Total Classes</span>
          </div>
          {member.lastPromotionAt && (
            <div className={styles.statItem}>
              <span className={styles.statValue}>
                {new Date(member.lastPromotionAt).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric'
                })}
              </span>
              <span className={styles.statLabel}>Last Promotion</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default BeltProgressionCard;

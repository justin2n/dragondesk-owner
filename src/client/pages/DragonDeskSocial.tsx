import React, { useEffect, useState } from 'react';
import { api } from '../utils/api';
import { SocialPost, SocialComment } from '../types';
import { useLocation } from '../contexts/LocationContext';
import { useToast } from '../components/Toast';
import styles from './DragonDeskSocial.module.css';

type ViewMode = 'list' | 'create' | 'edit' | 'feed';
type ActiveTab = 'facebook' | 'instagram' | 'twitter';

interface SocialAccount {
  id: number;
  platform: 'facebook' | 'instagram' | 'twitter' | 'linkedin';
  accountName: string;
  accountId: string;
  pageId?: string;
  pageName?: string;
  isActive: boolean;
  createdAt: string;
}

interface SocialCampaign {
  id: number;
  name: string;
  description: string;
  postContent: string;
  mediaUrls: string[];
  platforms: string[];
  accountIds: number[];
  scheduledFor?: string;
  status: 'draft' | 'scheduled' | 'published' | 'failed';
  publishedAt?: string;
  results?: any;
  createdAt: string;
}

const DragonDeskSocial = () => {
  const { toast, confirm } = useToast();
  const { selectedLocation, isAllLocations } = useLocation();
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [activeTab, setActiveTab] = useState<ActiveTab>('facebook');
  const [campaigns, setCampaigns] = useState<SocialCampaign[]>([]);
  const [socialAccounts, setSocialAccounts] = useState<SocialAccount[]>([]);
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [selectedPost, setSelectedPost] = useState<SocialPost | null>(null);
  const [comments, setComments] = useState<SocialComment[]>([]);
  const [replyText, setReplyText] = useState<{ [key: number]: string }>({});
  const [isLoading, setIsLoading] = useState(true);
  const [editingCampaign, setEditingCampaign] = useState<SocialCampaign | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    postContent: '',
    mediaUrls: [] as string[],
    platforms: [] as string[],
    accountIds: [] as number[],
    scheduledFor: '',
    status: 'draft' as 'draft' | 'scheduled' | 'published' | 'failed',
  });

  useEffect(() => {
    loadData();
  }, [selectedLocation, isAllLocations]);

  const loadData = async () => {
    try {
      const locationId = isAllLocations ? 'all' : selectedLocation?.id;
      const [campaignsData, accountsData] = await Promise.all([
        api.get(`/social-campaigns?locationId=${locationId}`),
        api.get('/social-accounts'),
      ]);

      const parsedCampaigns = campaignsData.map((campaign: any) => ({
        ...campaign,
        platforms: typeof campaign.platforms === 'string' ? JSON.parse(campaign.platforms) : campaign.platforms,
        accountIds: typeof campaign.accountIds === 'string' ? JSON.parse(campaign.accountIds) : campaign.accountIds,
        mediaUrls: campaign.mediaUrls && typeof campaign.mediaUrls === 'string' ? JSON.parse(campaign.mediaUrls) : campaign.mediaUrls || [],
        results: campaign.results && typeof campaign.results === 'string' ? JSON.parse(campaign.results) : campaign.results,
      }));

      setCampaigns(parsedCampaigns);
      setSocialAccounts(accountsData);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadPosts = async (platform?: string) => {
    try {
      const locationId = isAllLocations ? 'all' : selectedLocation?.id;
      const platformParam = platform ? `&platform=${platform}` : '';
      const url = `/social-posts?locationId=${locationId}${platformParam}`;
      const postsData = await api.get(url);
      setPosts(postsData);
    } catch (error) {
      console.error('Failed to load posts:', error);
    }
  };

  const loadComments = async (postId: number) => {
    try {
      const locationId = isAllLocations ? 'all' : selectedLocation?.id;
      const commentsData = await api.get(`/social-comments/post/${postId}?locationId=${locationId}`);
      setComments(commentsData);
    } catch (error) {
      console.error('Failed to load comments:', error);
    }
  };

  const handleViewPost = async (post: SocialPost) => {
    setSelectedPost(post);
    await loadComments(post.id);
  };

  const handleHideComment = async (commentId: number, isHidden: boolean) => {
    try {
      await api.patch(`/social-comments/${commentId}/hide`, { isHidden: !isHidden });
      await loadComments(selectedPost!.id);
    } catch (error: any) {
      toast(error.message || 'Failed to hide/unhide comment', 'error');
    }
  };

  const handleReplyToComment = async (commentId: number) => {
    const text = replyText[commentId];
    if (!text || !text.trim()) {
      toast('Please enter a reply', 'error');
      return;
    }

    try {
      await api.post(`/social-comments/${commentId}/reply`, {
        replyText: text,
        sendNow: true,
      });
      setReplyText({ ...replyText, [commentId]: '' });
      await loadComments(selectedPost!.id);
    } catch (error: any) {
      toast(error.message || 'Failed to send reply', 'error');
    }
  };

  const handleCreateCampaign = (platform: ActiveTab) => {
    setEditingCampaign(null);
    const platformMapping: any = {
      facebook: 'facebook',
      instagram: 'instagram',
      twitter: 'twitter',
    };
    setFormData({
      name: '',
      description: '',
      postContent: '',
      mediaUrls: [],
      platforms: [platformMapping[platform]],
      accountIds: [],
      scheduledFor: '',
      status: 'draft',
    });
    setViewMode('create');
  };

  const handleEditCampaign = (campaign: SocialCampaign) => {
    setEditingCampaign(campaign);
    setFormData({
      name: campaign.name,
      description: campaign.description,
      postContent: campaign.postContent,
      mediaUrls: campaign.mediaUrls || [],
      platforms: campaign.platforms,
      accountIds: campaign.accountIds,
      scheduledFor: campaign.scheduledFor || '',
      status: campaign.status,
    });
    setViewMode('edit');
  };

  const handleSubmitCampaign = async (e: React.FormEvent) => {
    e.preventDefault();

    if (formData.platforms.length === 0) {
      toast('Please select at least one platform', 'error');
      return;
    }

    if (formData.accountIds.length === 0) {
      toast('Please select at least one social account', 'error');
      return;
    }

    try {
      if (editingCampaign) {
        await api.put(`/social-campaigns/${editingCampaign.id}`, formData);
      } else {
        await api.post('/social-campaigns', formData);
      }

      setViewMode('list');
      loadData();
    } catch (error: any) {
      toast(error.message || 'Failed to save social campaign', 'error');
    }
  };

  const handleCancel = () => {
    setViewMode('list');
    setEditingCampaign(null);
  };

  const handleDelete = async (id: number) => {
    if (!await confirm({ title: 'Delete Campaign', message: 'Are you sure you want to delete this campaign?', confirmLabel: 'Delete', danger: true })) return;

    try {
      await api.delete(`/social-campaigns/${id}`);
      loadData();
    } catch (error: any) {
      toast(error.message || 'Failed to delete campaign', 'error');
    }
  };

  const handlePublishNow = async (id: number) => {
    if (!await confirm({ title: 'Publish Now', message: 'Publish this post now to all selected platforms?', confirmLabel: 'Publish' })) return;

    try {
      await api.post(`/social-campaigns/${id}/publish`);
      loadData();
    } catch (error: any) {
      toast(error.message || 'Failed to publish campaign', 'error');
    }
  };

  const getPlatformIcon = (platform: string) => {
    const icons: any = {
      facebook: '📘',
      instagram: '📷',
      twitter: '🐦',
      linkedin: '💼',
    };
    return icons[platform] || '📱';
  };

  const togglePlatform = (platform: string) => {
    setFormData((prev) => ({
      ...prev,
      platforms: prev.platforms.includes(platform)
        ? prev.platforms.filter((p) => p !== platform)
        : [...prev.platforms, platform],
    }));
  };

  const toggleAccount = (accountId: number) => {
    setFormData((prev) => ({
      ...prev,
      accountIds: prev.accountIds.includes(accountId)
        ? prev.accountIds.filter((id) => id !== accountId)
        : [...prev.accountIds, accountId],
    }));
  };

  // Filter campaigns by platform
  const getFilteredCampaigns = (platform: ActiveTab) => {
    const platformMapping: any = {
      facebook: 'facebook',
      instagram: 'instagram',
      twitter: 'twitter',
    };
    return campaigns.filter(c => c.platforms.includes(platformMapping[platform]));
  };

  // Get accounts for platform
  const getAccountsForPlatform = (platform: ActiveTab) => {
    const platformMapping: any = {
      facebook: 'facebook',
      instagram: 'instagram',
      twitter: 'twitter',
    };
    return socialAccounts.filter(a => a.platform === platformMapping[platform] && a.isActive);
  };

  // Render campaign list for a specific platform
  const renderPlatformCampaigns = (platform: ActiveTab) => {
    const platformCampaigns = getFilteredCampaigns(platform);
    const platformAccounts = getAccountsForPlatform(platform);

    const platformNames: Record<ActiveTab, string> = {
      facebook: 'Facebook',
      instagram: 'Instagram',
      twitter: 'X'
    };

    return (
      <>
        <div className={styles.tabHeader}>
          <div>
            <h3 className={styles.tabTitle}>
              {platformNames[platform]} Campaigns
            </h3>
            <p className={styles.tabSubtitle}>
              Manage your {platformNames[platform]} posts and campaigns
            </p>
          </div>
          <button onClick={() => handleCreateCampaign(platform)} className={styles.primaryBtn}>
            + Create Post
          </button>
        </div>

        {platformAccounts.length === 0 && (
          <div className={styles.warning}>
            <strong>⚠️ No {platform} accounts connected.</strong> Go to Settings → Social Settings to connect your {platform} account.
          </div>
        )}

        {platformCampaigns.length === 0 ? (
          <div className={styles.empty}>
            <p>No {platform} campaigns yet. Create your first post to get started!</p>
          </div>
        ) : (
          <div className={styles.grid}>
            {platformCampaigns.map((campaign) => (
              <div key={campaign.id} className={styles.card}>
                <div className={styles.cardHeader}>
                  <h3 className={styles.cardTitle}>{campaign.name}</h3>
                  <span className={`${styles.badge} ${styles[campaign.status]}`}>
                    {campaign.status}
                  </span>
                </div>
                <div className={styles.cardBody}>
                  {campaign.description && (
                    <p className={styles.description}>{campaign.description}</p>
                  )}
                  <div className={styles.postPreview}>
                    <p>{campaign.postContent.substring(0, 150)}{campaign.postContent.length > 150 ? '...' : ''}</p>
                  </div>
                  <div className={styles.cardInfo}>
                    <span className={styles.label}>Accounts:</span>
                    <span>
                      {campaign.accountIds.map(id => {
                        const account = socialAccounts.find(a => a.id === id);
                        return account ? account.accountName : 'Unknown';
                      }).join(', ')}
                    </span>
                  </div>
                  {campaign.scheduledFor && (
                    <div className={styles.cardInfo}>
                      <span className={styles.label}>Scheduled:</span>
                      <span>{new Date(campaign.scheduledFor).toLocaleString()}</span>
                    </div>
                  )}
                  {campaign.publishedAt && (
                    <div className={styles.cardInfo}>
                      <span className={styles.label}>Published:</span>
                      <span>{new Date(campaign.publishedAt).toLocaleString()}</span>
                    </div>
                  )}
                </div>
                <div className={styles.cardFooter}>
                  <button onClick={() => handleEditCampaign(campaign)} className={styles.editBtn}>
                    Edit
                  </button>
                  {campaign.status === 'draft' && (
                    <button onClick={() => handlePublishNow(campaign.id)} className={styles.publishBtn}>
                      Publish Now
                    </button>
                  )}
                  <button onClick={() => handleDelete(campaign.id)} className={styles.deleteBtn}>
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </>
    );
  };

  // Render campaign list with tabs
  const renderCampaignsList = () => (
    <>
      <div className={styles.pageHeader}>
        <div>
          <h2 className={styles.pageTitle}>Social Campaigns</h2>
          <p className={styles.pageSubtitle}>Create and manage social media posts</p>
        </div>
        <button onClick={() => setViewMode('feed')} className={styles.primaryBtn}>
          📱 View Social Feed
        </button>
      </div>

      <div className={styles.info}>
        <p>
          Create social media posts and campaigns across Facebook, Instagram, and X (Twitter).
          Schedule posts, track engagement, and manage all your social media from one place.
        </p>
      </div>

      {/* Platform Tabs */}
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${activeTab === 'facebook' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('facebook')}
        >
          <span>Facebook</span>
          <span className={styles.tabBadge}>
            {getFilteredCampaigns('facebook').length}
          </span>
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'instagram' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('instagram')}
        >
          <span>Instagram</span>
          <span className={styles.tabBadge}>
            {getFilteredCampaigns('instagram').length}
          </span>
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'twitter' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('twitter')}
        >
          <span>X (Twitter)</span>
          <span className={styles.tabBadge}>
            {getFilteredCampaigns('twitter').length}
          </span>
        </button>
      </div>

      {/* Tab Content */}
      <div className={styles.tabContent}>
        {isLoading ? (
          <div className={styles.loading}>Loading campaigns...</div>
        ) : (
          renderPlatformCampaigns(activeTab)
        )}
      </div>
    </>
  );

  // Render create/edit form
  const renderForm = () => {
    const activeAccounts = socialAccounts.filter(a => a.isActive);
    const availablePlatforms = [...new Set(activeAccounts.map(a => a.platform))];

    return (
      <>
        <div className={styles.pageHeader}>
          <div>
            <h2 className={styles.pageTitle}>
              {editingCampaign ? 'Edit Campaign' : 'Create New Campaign'}
            </h2>
            <p className={styles.pageSubtitle}>
              {editingCampaign ? 'Update your social media campaign' : 'Create a new social media post'}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmitCampaign} className={styles.form}>
          <div className={styles.formSection}>
            <h3 className={styles.sectionTitle}>Campaign Details</h3>

            <div className={styles.formGroup}>
              <label className={styles.label}>Campaign Name *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className={styles.input}
                placeholder="Summer Promotion 2024"
                required
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Description</label>
              <input
                type="text"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className={styles.input}
                placeholder="Brief description of this campaign"
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Post Content *</label>
              <textarea
                value={formData.postContent}
                onChange={(e) => setFormData({ ...formData, postContent: e.target.value })}
                className={styles.textarea}
                rows={6}
                placeholder="Write your social media post here..."
                required
              />
              <span className={styles.charCount}>{formData.postContent.length} characters</span>
            </div>
          </div>

          <div className={styles.formSection}>
            <h3 className={styles.sectionTitle}>Platforms & Accounts</h3>

            {availablePlatforms.length === 0 ? (
              <div className={styles.warning}>
                <strong>⚠️ No social accounts connected.</strong> Go to Settings → Social Settings to connect your accounts.
              </div>
            ) : (
              <>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Select Platforms *</label>
                  <div className={styles.platformSelector}>
                    {availablePlatforms.filter(p => p !== 'linkedin').map((platform) => (
                      <div
                        key={platform}
                        className={`${styles.platformCard} ${formData.platforms.includes(platform) ? styles.selected : ''}`}
                        onClick={() => togglePlatform(platform)}
                      >
                        <span className={styles.platformIconLarge}>{getPlatformIcon(platform)}</span>
                        <span className={styles.platformName}>
                          {platform === 'twitter' ? 'X (Twitter)' : platform.charAt(0).toUpperCase() + platform.slice(1)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.label}>Select Accounts *</label>
                  <div className={styles.accountsList}>
                    {activeAccounts
                      .filter(account => formData.platforms.includes(account.platform) && account.platform !== 'linkedin')
                      .map((account) => (
                        <div key={account.id} className={styles.accountItem}>
                          <label className={styles.checkboxLabel}>
                            <input
                              type="checkbox"
                              checked={formData.accountIds.includes(account.id)}
                              onChange={() => toggleAccount(account.id)}
                              className={styles.checkbox}
                            />
                            <span className={styles.accountInfo}>
                              <span className={styles.platformIconSmall}>{getPlatformIcon(account.platform)}</span>
                              <span>
                                <strong>{account.accountName}</strong>
                                {account.pageName && <span className={styles.pageName}> → {account.pageName}</span>}
                              </span>
                            </span>
                          </label>
                        </div>
                      ))}
                  </div>
                </div>
              </>
            )}
          </div>

          <div className={styles.formSection}>
            <h3 className={styles.sectionTitle}>Scheduling</h3>

            <div className={styles.formGroup}>
              <label className={styles.label}>Schedule For (Optional)</label>
              <input
                type="datetime-local"
                value={formData.scheduledFor}
                onChange={(e) => setFormData({ ...formData, scheduledFor: e.target.value, status: e.target.value ? 'scheduled' : 'draft' })}
                className={styles.input}
              />
              <span className={styles.helpText}>Leave empty to publish manually or save as draft</span>
            </div>
          </div>

          <div className={styles.formActions}>
            <button type="button" onClick={handleCancel} className={styles.cancelBtn}>
              Cancel
            </button>
            <button type="submit" className={styles.submitBtn}>
              {editingCampaign ? 'Update Campaign' : 'Create Campaign'}
            </button>
          </div>
        </form>
      </>
    );
  };

  // Render Feed View
  const renderFeed = () => {
    useEffect(() => {
      loadPosts();
    }, []);

    if (selectedPost) {
      return (
        <>
          <div className={styles.pageHeader}>
            <div>
              <h2 className={styles.pageTitle}>Post Details</h2>
              <p className={styles.pageSubtitle}>View and manage comments</p>
            </div>
            <button onClick={() => setSelectedPost(null)} className={styles.cancelBtn}>
              ← Back to Feed
            </button>
          </div>

          <div className={styles.postDetail}>
            <div className={styles.postHeader}>
              <div>
                <span className={styles.platformBadge}>{selectedPost.platform}</span>
                <span className={styles.postDate}>
                  {new Date(selectedPost.publishedAt || selectedPost.createdAt).toLocaleString()}
                </span>
              </div>
            </div>
            <div className={styles.postContent}>
              <p>{selectedPost.postContent}</p>
              {selectedPost.mediaUrls && selectedPost.mediaUrls.length > 0 && (
                <div className={styles.postMedia}>
                  {selectedPost.mediaUrls.map((url, idx) => (
                    <img key={idx} src={url} alt="Post media" className={styles.mediaImage} />
                  ))}
                </div>
              )}
            </div>
            <div className={styles.postStats}>
              <span>❤️ {selectedPost.likes} Likes</span>
              <span>💬 {selectedPost.comments} Comments</span>
              <span>🔄 {selectedPost.shares} Shares</span>
            </div>
          </div>

          <div className={styles.commentsSection}>
            <h3 className={styles.commentsTitle}>Comments ({comments.length})</h3>

            {comments.length === 0 ? (
              <p className={styles.noComments}>No comments yet</p>
            ) : (
              <div className={styles.commentsList}>
                {comments.map((comment) => (
                  <div key={comment.id} className={`${styles.commentCard} ${comment.isHidden ? styles.hiddenComment : ''}`}>
                    <div className={styles.commentHeader}>
                      <div className={styles.authorInfo}>
                        {comment.authorImageUrl && (
                          <img src={comment.authorImageUrl} alt={comment.authorName} className={styles.authorAvatar} />
                        )}
                        <div>
                          <div className={styles.authorName}>{comment.authorName}</div>
                          <div className={styles.commentDate}>
                            {new Date(comment.commentedAt).toLocaleString()}
                          </div>
                        </div>
                      </div>
                      <div className={styles.commentActions}>
                        <button
                          onClick={() => handleHideComment(comment.id, comment.isHidden)}
                          className={styles.commentActionBtn}
                          title={comment.isHidden ? 'Unhide comment' : 'Hide comment'}
                        >
                          {comment.isHidden ? '👁️' : '🚫'}
                        </button>
                      </div>
                    </div>
                    <div className={styles.commentText}>{comment.commentText}</div>
                    <div className={styles.commentMeta}>
                      <span>❤️ {comment.likes}</span>
                      {comment.sentiment && (
                        <span className={styles[`sentiment-${comment.sentiment}`]}>
                          {comment.sentiment === 'positive' ? '😊' : comment.sentiment === 'negative' ? '😞' : '😐'}
                          {comment.sentiment}
                        </span>
                      )}
                      {comment.isReplied && <span className={styles.repliedBadge}>✓ Replied</span>}
                    </div>
                    <div className={styles.replyBox}>
                      <textarea
                        value={replyText[comment.id] || ''}
                        onChange={(e) => setReplyText({ ...replyText, [comment.id]: e.target.value })}
                        placeholder="Write a reply..."
                        className={styles.replyInput}
                        rows={2}
                      />
                      <button
                        onClick={() => handleReplyToComment(comment.id)}
                        className={styles.replyBtn}
                      >
                        Send Reply
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      );
    }

    return (
      <>
        <div className={styles.pageHeader}>
          <div>
            <h2 className={styles.pageTitle}>Social Feed</h2>
            <p className={styles.pageSubtitle}>View and manage your published posts</p>
          </div>
          <div className={styles.feedActions}>
            <button onClick={() => setViewMode('list')} className={styles.cancelBtn}>
              ← Back to Campaigns
            </button>
            <button onClick={() => loadPosts()} className={styles.primaryBtn}>
              🔄 Refresh Feed
            </button>
          </div>
        </div>

        {posts.length === 0 ? (
          <div className={styles.empty}>
            <p>No published posts yet. Publish a campaign to see posts here!</p>
          </div>
        ) : (
          <div className={styles.feedGrid}>
            {posts.map((post) => (
              <div key={post.id} className={styles.feedCard}>
                <div className={styles.feedCardHeader}>
                  <span className={styles.platformBadge}>{post.platform}</span>
                  <span className={styles.postDate}>
                    {new Date(post.publishedAt || post.createdAt).toLocaleString()}
                  </span>
                </div>
                <div className={styles.feedCardContent}>
                  <p>{post.postContent.substring(0, 200)}{post.postContent.length > 200 ? '...' : ''}</p>
                </div>
                <div className={styles.feedCardStats}>
                  <span>❤️ {post.likes}</span>
                  <span>💬 {post.comments}</span>
                  <span>🔄 {post.shares}</span>
                  <span>👁️ {post.impressions}</span>
                </div>
                <div className={styles.feedCardFooter}>
                  <button onClick={() => handleViewPost(post)} className={styles.viewCommentsBtn}>
                    View & Reply to Comments
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </>
    );
  };

  return (
    <div className={styles.container}>
      {viewMode === 'feed' ? renderFeed() : (viewMode === 'list' ? renderCampaignsList() : renderForm())}
    </div>
  );
};

export default DragonDeskSocial;

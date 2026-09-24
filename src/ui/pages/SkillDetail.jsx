import React, { useState, useEffect } from 'react';
import axios from 'axios';
import ReviewForm from '../components/ReviewForm.jsx';
import ReviewList from '../components/ReviewList.jsx';
import RelatedSkills from '../components/RelatedSkills.jsx';
import RatingStars from '../components/RatingStars.jsx';
import VersionPinSelector from '../components/VersionPinSelector.jsx';
import ratingsFixture from '../fixtures/ratings.json';
import relatedFixture from '../fixtures/related.json';

export default function SkillDetail({ skillId, onBack, authenticated = true }) {
  const [skill, setSkill] = useState(null);
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [installing, setInstalling] = useState(false);
  const [installStatus, setInstallStatus] = useState(null);

  // Ratings + related (fixtures-first; see SWAP POINT comments below).
  const [reviews, setReviews] = useState([]);
  const [reviewsLoading, setReviewsLoading] = useState(true);
  const [reviewsError, setReviewsError] = useState(null);
  const [related, setRelated] = useState([]);
  const [myReview, setMyReview] = useState(null);
  const [constraint, setConstraint] = useState('^1.0.0');

  useEffect(() => {
    fetchSkillDetail();
    loadReviews();
    loadRelated();
  }, [skillId]);

  const fetchSkillDetail = async () => {
    setLoading(true);
    setError(null);
    try {
      const [skillRes, versionsRes] = await Promise.all([
        axios.get(`/api/v1/skills/${skillId}`),
        axios.get(`/api/v1/skills/${skillId}/versions`),
      ]);
      setSkill(skillRes.data.data);
      setVersions(versionsRes.data.data || []);
    } catch (err) {
      setError(err.message || 'Failed to load skill details');
    } finally {
      setLoading(false);
    }
  };

  // SWAP POINT: axios.get(`/api/v1/skills/${skillId}/ratings`).then(r => r.data.data)
  const loadReviews = () => {
    setReviewsLoading(true);
    setReviewsError(null);
    try {
      const data = ratingsFixture.data || [];
      setReviews(data);
    } catch (err) {
      setReviewsError(err.message || 'Failed to load reviews');
    } finally {
      setReviewsLoading(false);
    }
  };

  // SWAP POINT: axios.get(`/api/v1/skills/${skillId}/related`).then(r => r.data.data)
  const loadRelated = () => {
    setRelated(relatedFixture.data || []);
  };

  const handleReviewSubmit = ({ score, reviewText }) => {
    // SWAP POINT: POST/PUT /api/v1/skills/:id/ratings (user_id from session).
    const now = new Date().toISOString();
    const saved = {
      id: myReview ? myReview.id : Date.now(),
      skillId,
      userId: 'me',
      score,
      reviewText,
      createdAt: myReview ? myReview.createdAt : now,
      updatedAt: now,
    };
    setMyReview(saved);
    setReviews((prev) => {
      const others = prev.filter((r) => r.userId !== 'me');
      return [saved, ...others];
    });
  };

  const handleInstall = async () => {
    if (!versions.length) {
      setInstallStatus({ type: 'error', text: 'No versions available' });
      return;
    }
    setInstalling(true);
    setInstallStatus(null);
    try {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      setInstallStatus({ type: 'success', text: 'Installation successful' });
    } catch (err) {
      setInstallStatus({ type: 'error', text: 'Installation failed: ' + (err.message || 'Unknown error') });
    } finally {
      setInstalling(false);
    }
  };

  if (loading) {
    return (
      <div className="skill-detail-container">
        <button onClick={onBack} className="back-button" aria-label="Close">×</button>
        <div className="loading" role="status">Loading skill details…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="skill-detail-container">
        <button onClick={onBack} className="back-button" aria-label="Close">×</button>
        <div className="error-message" role="alert">{error}</div>
      </div>
    );
  }

  if (!skill) {
    return (
      <div className="skill-detail-container">
        <button onClick={onBack} className="back-button" aria-label="Close">×</button>
        <div className="empty-state">Skill not found</div>
      </div>
    );
  }

  const rating = skill.rating || { average: 0, count: 0 };
  const avgScore = rating.average ? parseFloat(rating.average).toFixed(1) : 'N/A';
  const resolved = versions.length
    ? (versions.map((v) => (typeof v === 'string' ? v : v.version_tag))[0] || null)
    : null;

  return (
    <div className="skill-detail-container">
      <div className="skill-detail">
        <button onClick={onBack} className="back-button" aria-label="Close">×</button>
        <span className="category-badge">{skill.category?.toUpperCase()}</span>
        <div className="skill-detail-header">
          <div>
            <h1>{skill.name}</h1>
            <p className="skill-owner">By {skill.owner}</p>
          </div>
        </div>

        <div className="skill-detail-rating">
          <RatingStars value={rating.average} />
          <span className="rating-value">{avgScore} ({rating.count} reviews)</span>
        </div>

        <section className="skill-section">
          <p>{skill.description}</p>
        </section>

        {versions.length > 0 && (
          <section className="skill-section">
            <VersionPinSelector
              versions={versions}
              constraint={constraint}
              resolved={resolved}
              onConstraintChange={setConstraint}
            />
          </section>
        )}

        <div className="skill-actions">
          <button
            onClick={handleInstall}
            disabled={installing}
            className="install-button"
          >
            {installing ? 'INSTALLING…' : 'INSTALL'}
          </button>
          {installStatus && (
            <div className={`install-status ${installStatus.type}`} role="status">
              {installStatus.text}
            </div>
          )}
        </div>

        <section className="skill-section">
          <ReviewForm
            skillId={skillId}
            existingReview={myReview}
            onSubmit={handleReviewSubmit}
            authenticated={authenticated}
          />
        </section>

        <section className="skill-section">
          <h2 className="section-heading">Reviews</h2>
          <ReviewList reviews={reviews} loading={reviewsLoading} error={reviewsError} />
        </section>

        <RelatedSkills skillId={skillId} skills={related} />
      </div>
    </div>
  );
}

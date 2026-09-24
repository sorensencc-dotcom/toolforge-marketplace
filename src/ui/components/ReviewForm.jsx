import React, { useState } from 'react';
import RatingStars from './RatingStars.jsx';

const MAX_LEN = 200;

/**
 * ReviewForm — submit or edit the current user's rating for a skill.
 *
 * @param {object}   props
 * @param {number|string} props.skillId
 * @param {object}  [props.existingReview]  Current user's review, if any ({score, reviewText}).
 * @param {(payload:{skillId, score:number, reviewText:string})=>void} props.onSubmit
 * @param {boolean} [props.authenticated]    When false, renders a sign-in prompt instead of the form.
 * @param {()=>void}[props.onSignIn]         Optional sign-in handler.
 */
export default function ReviewForm({
  skillId,
  existingReview = null,
  onSubmit,
  authenticated = true,
  onSignIn,
}) {
  const [score, setScore] = useState(existingReview ? existingReview.score : 0);
  const [reviewText, setReviewText] = useState(existingReview ? existingReview.reviewText || '' : '');
  const [error, setError] = useState(null);

  if (!authenticated) {
    return (
      <div className="review-form review-form-signin">
        <p className="signin-prompt">Sign in to rate this skill.</p>
        <button type="button" className="signin-button" onClick={onSignIn}>
          Sign In
        </button>
      </div>
    );
  }

  const isEdit = Boolean(existingReview);
  const remaining = MAX_LEN - reviewText.length;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (score < 1 || score > 5) {
      setError('Select a star rating before submitting.');
      return;
    }
    setError(null);
    if (onSubmit) {
      onSubmit({ skillId, score, reviewText: reviewText.trim() });
    }
  };

  return (
    <form className="review-form" onSubmit={handleSubmit} aria-label={isEdit ? 'Edit your review' : 'Write a review'}>
      <h3 className="review-form-title">{isEdit ? 'Edit Your Review' : 'Rate This Skill'}</h3>

      <div className="review-form-field">
        <span className="field-label" id={`score-label-${skillId}`}>Your Rating</span>
        <div aria-labelledby={`score-label-${skillId}`}>
          <RatingStars value={score} editable onChange={setScore} size="lg" />
        </div>
      </div>

      <div className="review-form-field">
        <label className="field-label" htmlFor={`review-text-${skillId}`}>
          Review <span className="field-optional">(optional)</span>
        </label>
        <textarea
          id={`review-text-${skillId}`}
          className="review-textarea"
          value={reviewText}
          maxLength={MAX_LEN}
          rows={3}
          placeholder="What stood out? Keep it useful for the next person."
          onChange={(e) => setReviewText(e.target.value)}
          aria-describedby={`review-count-${skillId}`}
        />
        <span
          id={`review-count-${skillId}`}
          className={`char-count ${remaining < 20 ? 'char-count-low' : ''}`}
        >
          {remaining} characters left
        </span>
      </div>

      {error && (
        <p className="review-form-error" role="alert">{error}</p>
      )}

      <button type="submit" className="review-submit-button">
        {isEdit ? 'Update Review' : 'Submit Review'}
      </button>
    </form>
  );
}

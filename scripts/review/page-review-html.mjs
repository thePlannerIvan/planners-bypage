import { pathToFileURL } from 'node:url';
import { moduleScript } from '../lib/planners-modules.mjs';
const {renderContentReview} = await import(pathToFileURL(moduleScript('planners-review-core', 'scripts/render-content-review.mjs')));
export const renderPageReviewHtml = renderContentReview;

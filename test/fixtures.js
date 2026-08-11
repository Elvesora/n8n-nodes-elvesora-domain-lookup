'use strict';

function foundResponse(overrides = {}) {
	return {
		success: true,
		message: 'Company lookup completed successfully',
		company_name: 'Acme Corporation',
		normalized_company_name: 'acme corporation',
		domain: 'acme.com',
		linkedin_url: 'https://www.linkedin.com/company/acme',
		industry: 'Industrial Machinery',
		sub_industry: 'Industrial Equipment',
		sector: 'Industrials',
		confidence: 92,
		confidence_band: 'high',
		review_recommended: false,
		is_live: true,
		reasons: ['Company name matches website brand.'],
		lower_reasons: [],
		cached: false,
		found: true,
		remaining: 95,
		limit: 100,
		...overrides,
	};
}

function noMatchResponse(overrides = {}) {
	return foundResponse({
		message: 'No domain found for this company.',
		company_name: 'Unknown Company',
		normalized_company_name: 'unknown company',
		domain: null,
		linkedin_url: null,
		industry: null,
		sub_industry: null,
		sector: null,
		confidence: 0,
		confidence_band: 'no_match',
		review_recommended: true,
		is_live: null,
		reasons: ['No reliable public domain matched this company.'],
		found: false,
		...overrides,
	});
}

module.exports = { foundResponse, noMatchResponse };

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import documents from '../../../../messages/en/documents.json';
import PlanningRelevance from './PlanningRelevance';

function render(assessments: Parameters<typeof PlanningRelevance>[0]['assessments']) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={{ documents }} timeZone="UTC">
      <PlanningRelevance
        assessments={assessments}
        sources={[
          {
            attachmentId: 'spec',
            filename: 'requirements.docx',
            blocks: [{ ref: 'spec:block-1', text: 'Login is required.' }],
          },
        ]}
      />
    </NextIntlClientProvider>,
  );
}

describe('planning document relevance preview', () => {
  it('shows the document name, classification, explanation and evidence blocks', () => {
    const html = render([
      {
        attachmentId: 'spec',
        classification: 'requirements',
        explanation: 'Defines login requirements that match the brief.',
        relevantBlockRefs: ['spec:block-1'],
      },
    ]);
    assert.match(html, /requirements\.docx/);
    assert.match(html, /Requirements/);
    assert.match(html, /Defines login requirements that match the brief\./);
    assert.match(html, /spec:block-1/);
  });

  it('explains that a preview without uploaded documents uses the brief', () => {
    assert.match(render([]), /based on the project brief/);
  });
});

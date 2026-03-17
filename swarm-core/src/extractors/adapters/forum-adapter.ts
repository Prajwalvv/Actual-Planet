import { EvidenceItem } from '../../adaptive-types';
import { buildEvidenceItem, ExtractorInput, TerrainAdapter } from '../terrain-adapter';

export class ForumAdapter implements TerrainAdapter {
  terrain: 'forum' = 'forum';

  extract(input: ExtractorInput): EvidenceItem[] {
    return [buildEvidenceItem(input, 'forum', 0.03)];
  }
}

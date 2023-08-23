import type { ListSpec } from '.';
import { fetchList } from '.';

describe('fetchList', () => {
  it('fetches  and parses tranco', async () => {
    const trancoSpec: ListSpec = {
      name: 'tranco',
      url: 'https://tranco-list.eu/download/K25GW/100000',
      parsers: [
        {
          split: { delimiter: '\n' },
        },
        {
          cut: { delimiter: ',', field: 1 },
        },
      ],
    };
    const result = await fetchList(trancoSpec);
    expect(result).toHaveLength(100000);
    expect(result).toContain('europa.eu');
  });
});

import fs from 'fs';
import { fetch } from 'undici';
import { join } from 'path';

require('dotenv').config({ path: join(__dirname, '/.update-lists.env') });

const DB_PATH = join(__dirname) + '/db';

const ENDPOINTS = {
  TRANCO_LIST: 'https://tranco-list.eu/download/K25GW/100000',
  COINMARKETCAP:
    'https://pro-api.coinmarketcap.com/v1/cryptocurrency/listings/latest?limit=5000&start=1&sort=market_cap_strict&market_cap_min=10000000',
  COINMARKETCAP_COIN_INFO:
    'https://pro-api.coinmarketcap.com/v2/cryptocurrency/info?id=',
};

function arrayTo2DArray1(arr: any[], size: number) {
  const res = [];
  for (let i = 0; i < arr.length; i++) {
    if (i % size === 0) {
      // Push a new array containing the current value to the res array
      res.push([arr[i]]);
    } else {
      // Push the current value to the current array
      res[res.length - 1]!.push(arr[i]);
    }
  }
  return res;
}

/*
const touchFile = (path: string) => {
  const time = new Date();
  try {
    fs.utimesSync(path, time, time);
  } catch (err) {
    fs.closeSync(fs.openSync(path, 'w'));
  }
};
*/

async function updateTrancoList() {
  const PATH_CSV = DB_PATH + '/trancoList.csv';

  /* TODO: This filtering should be done at runtime when checking */
  // This is a list of 'bad domains' (false positive) that we don't want to include in the final generated DB
  /*
  const excludeList = [
    'simdif.com',
    'gb.net',
    'btcs.love',
    'ferozo.com',
    'im-creator.com',
    'free-ethereum.io',
    '890m.com',
    'b5z.net',
    'test.com',
  ];
  */
  // Download updated list
  let trancoDomainsCsv: string;

  try {
    trancoDomainsCsv = await (await fetch(ENDPOINTS.TRANCO_LIST)).text();
  } catch (error) {
    throw new Error(
      'Problems while downloading the latest list. Error: ' + error
    );
  }
  if (fs.existsSync(DB_PATH + '/trancos-temp')) {
    try {
      fs.unlinkSync(DB_PATH + '/trancos-temp');
    } catch (err) {
      console.error(err);
    }
  }
  fs.writeFileSync(PATH_CSV, trancoDomainsCsv, {encoding: 'utf8'});

  // Split by newline and fetch second field from comma-delimited row
  const trancoDomains = trancoDomainsCsv.split('\n').filter(row => row.length).map(row => row.split(',')[1] as string);

  // Exclude false positive (bad domains) from tranco list
  // const re = new RegExp(`^(${excludeList.join('|')})$\n`, 'gm');
  // trancoDomains = trancoDomains.replace(re, '');

  fs.writeFileSync(DB_PATH + '/trancos-temp', trancoDomains.join('\n'));

  // copy temp list file
  console.log('Copying: temp list file... ');
  fs.copyFileSync(DB_PATH + '/trancos-temp', DB_PATH + '/trancos');
}

async function updateCoinmarketcapList() {
  if (fs.existsSync(DB_PATH + '/coinmarketcaps-temp')) {
    try {
      fs.unlinkSync(DB_PATH + '/coinmarketcaps-temp');
    } catch (err) {
      console.error(err);
    }
  }

  const apiKey = process.env.COINMARKETCAP_API_KEY;
  let coinsIds: string[] = [];
  let coinsMarketCaps: Record<string, string> = {};
  const coinsArray: string[][] = [];
  const coinsPerSubCall = 250; // how many coins (IDs) will be in the query string of coins metadata subcalls

  const delay = (t: number) =>
    new Promise((resolve) => setTimeout(resolve, t));

  // Call Coinmarketcap API
  try {
    // get only coins with market cap > 10M
    const response = await fetch(ENDPOINTS.COINMARKETCAP, {
      headers: {
        'X-CMC_PRO_API_KEY': apiKey || '',
      },
    });
    const body = await response.json() as any;
    body.data.forEach((coin: any) => {
      coinsMarketCaps[coin.id as string] = coin.quote.USD.market_cap;
      coinsIds.push(coin.id);
    });

    // divide total coins (IDs) to retrieve in chunks to create multiple calls to the coin metadata endpoint
    // this because coins Ids are passed to the endpoint as a query string param and query strings have a limit on their size/length
    const subcallsCoinsIds = arrayTo2DArray1(coinsIds, coinsPerSubCall);

    try {
      for (const subcallCoinsIds of subcallsCoinsIds) {
        await delay(2500);
        const response = await fetch(
          `${ENDPOINTS.COINMARKETCAP_COIN_INFO}${subcallCoinsIds.join(',')}`,
          {
            headers: {
              'X-CMC_PRO_API_KEY': apiKey || '',
            },
          }
        );
        const body: any = await response.json();

        Object.keys(body.data).forEach((coinId) => {
          coinsArray.push([
            body.data[coinId].name as string,
            coinsMarketCaps[coinId] as string,
            body.data[coinId].urls.website[0] as string,
          ]);
        });
      }
    } catch (error) {
      console.error(
        `Problems while calling Coinmarketcap API coins details endpoint. Error: ${error}`
      );
      process.exit(1);
    }
  } catch (error) {
    console.error(
      'Problems while calling Coinmarketcap API coins listing endpoint. Error: ' +
        error
    );
    process.exit(1);
  }

  for (const coin of coinsArray) {
    try {
      let coinDomainName = '';
      if (coin[2]) {
        const coinDomainSplit1 = coin[2].split(/(https:\/\/|http:\/\/)+/);
        const coinDomainSplit2 =
          coinDomainSplit1[coinDomainSplit1.length - 1]!.split(/(\/)+/);
        coinDomainName = coinDomainSplit2[0]!.replace('www.', '');
      }

      fs.appendFileSync(
        DB_PATH + '/coinmarketcaps-temp',
        coinDomainName + '\n'
      );
    } catch (err) {
      console.error(err);
    }
  }

  try {
    // copy temp list file
    console.log('Copying: temp list file... ');
    fs.copyFileSync(
      DB_PATH + '/coinmarketcaps-temp',
      DB_PATH + '/coinmarketcaps'
    );
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

const target = process.argv[2];

switch (target) {
  case 'tranco':
    updateTrancoList();
    break;
  case 'coinmarketcap':
    updateCoinmarketcapList();
    break;
  default:
    console.log('You need to specify either: "tranco" OR "coinmarketcap"');
    break;
}

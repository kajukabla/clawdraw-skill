import { getToken, getAgentInfo } from './bin/auth.mjs';

async function check() {
  const token = await getToken();
  const info = await getAgentInfo(token);
  console.log(JSON.stringify(info.inkBalance, null, 2));
}
check();

import runtimeWorker, { QuizRoom } from './runtime-worker.js';

export { QuizRoom };

const MOBILE_CSS = `
/* Mobile-first enhancements for COCQUIZ */
html{-webkit-text-size-adjust:100%;text-size-adjust:100%;overflow-x:hidden}
body{overflow-x:hidden;min-height:100dvh}
button,.btn,.option,input,select{touch-action:manipulation}
button,.btn{min-height:48px}
input,select{font-size:16px}
.wrap{padding-left:max(20px,env(safe-area-inset-left));padding-right:max(20px,env(safe-area-inset-right));padding-bottom:max(20px,env(safe-area-inset-bottom))}
.toast{max-width:min(92vw,720px);width:max-content;white-space:normal;text-align:left}
.rank .name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

@media(max-width:640px){
  .wrap{padding-top:max(10px,env(safe-area-inset-top));padding-left:max(12px,env(safe-area-inset-left));padding-right:max(12px,env(safe-area-inset-right));padding-bottom:max(16px,env(safe-area-inset-bottom))}
  .top{padding:4px 2px 12px;gap:8px}
  .brand{font-size:17px}
  .top>.pill{font-size:11px;padding:7px 9px;max-width:58vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .hero{display:block}
  .hero>.card:first-child{padding:20px 16px}
  .hero>.card:last-child{display:none}
  .card{padding:16px;border-radius:18px}
  h1{font-size:clamp(38px,12vw,52px);line-height:1.02;margin:10px 0 14px}
  h2{font-size:26px;line-height:1.2}
  .lead{font-size:16px;line-height:1.5}
  .actions{display:grid;grid-template-columns:1fr;gap:10px;margin-top:20px}
  .actions .btn{width:100%;min-height:52px;padding:13px 14px}
  .panel{width:100%;max-width:none;margin:14px auto}
  .field{margin:12px 0}
  .field label{font-size:13px}
  .field input,.field select{min-height:52px;padding:13px 14px;border-radius:12px}
  .grid2{grid-template-columns:1fr;gap:0}
  .roomcode{font-size:clamp(38px,16vw,62px);letter-spacing:.08em;overflow-wrap:anywhere}
  .members{max-height:30dvh;overflow:auto;-webkit-overflow-scrolling:touch;padding-bottom:4px}
  .quizgrid{grid-template-columns:1fr;gap:12px}
  .quizgrid>main{padding:16px}
  .quizgrid>.side{padding:14px;order:2}
  .qmeta{font-size:12px;flex-wrap:wrap;margin:10px 0 14px}
  .question{font-size:clamp(21px,5.8vw,27px);line-height:1.28;margin:14px 0 18px;overflow-wrap:anywhere}
  .options{grid-template-columns:1fr;gap:10px}
  .option{width:100%;min-height:64px;padding:14px;border-radius:14px;font-size:15px;line-height:1.35;align-items:flex-start}
  .letter{min-width:34px;width:34px;height:34px}
  .reveal{font-size:14px;padding:14px;margin-top:14px;overflow-wrap:anywhere}
  #hostControls{grid-template-columns:1fr}
  .timer{width:92px;height:92px;margin:2px auto 12px}
  .timer:after{inset:7px}
  .timer strong{font-size:26px}
  .sideTitle{font-size:15px}
  .rank{gap:8px;padding:10px 0;font-size:14px}
  .rank .num{width:30px;flex:0 0 30px}
  .rank .score{flex:0 0 auto}
  .podium{gap:6px;margin:24px 0 16px}
  .pod{padding:14px 6px;font-size:13px;overflow:hidden}
  .pod.first{min-height:160px}.pod.second{min-height:130px}.pod.third{min-height:110px}
  .medal{font-size:28px}
  .toast{left:12px;right:12px;bottom:max(12px,env(safe-area-inset-bottom));transform:none;width:auto;max-width:none;font-size:14px;padding:12px 14px}
}

@media(max-width:380px){
  h1{font-size:36px}
  .card{padding:14px}
  .question{font-size:20px}
  .option{font-size:14px;padding:12px}
  .roomcode{font-size:36px}
}

@media(max-height:520px) and (orientation:landscape){
  .wrap{padding-top:8px;padding-bottom:8px}
  .top{padding-bottom:8px}
  .hero>.card:first-child{padding:14px 18px}
  h1{font-size:36px;margin:6px 0 10px}
  .lead{font-size:14px;line-height:1.35}
  .actions{margin-top:12px}
  .panel{margin:8px auto}
  .quizgrid{grid-template-columns:minmax(0,1fr) 220px;gap:10px}
  .quizgrid>.side{order:initial}
  .question{font-size:20px;margin:10px 0 12px}
  .option{min-height:50px;padding:10px 12px}
  .timer{width:78px;height:78px}
}
`;

function makeMobileHtml(html) {
  return html
    .replace(
      '<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">',
      '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
    )
    .replace('</style>', `${MOBILE_CSS}</style>`);
}

export default {
  async fetch(request, env, ctx) {
    const response = await runtimeWorker.fetch(request, env, ctx);
    const url = new URL(request.url);
    const contentType = response.headers.get('content-type') || '';

    if (url.pathname === '/' && contentType.includes('text/html')) {
      const headers = new Headers(response.headers);
      headers.set('cache-control', 'no-store');
      const html = makeMobileHtml(await response.text());
      return new Response(html, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    }

    return response;
  },
};

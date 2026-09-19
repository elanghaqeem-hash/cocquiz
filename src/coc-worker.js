import hardenedWorker, { QuizRoom as HardenedQuizRoom, HostSession } from './worker.js';

export { HostSession };

const COC_QUESTIONS = [
  {
    q: 'Manakah pernyataan yang paling tepat menggambarkan hubungan antara kepatuhan dan etika?',
    o: [
      'Kepatuhan dan etika memiliki arti yang sama.',
      'Kepatuhan berfokus pada aturan, sedangkan etika membantu menentukan tindakan yang benar.',
      'Etika hanya berlaku jika tidak ada aturan.',
      'Kepatuhan lebih penting daripada integritas.'
    ],
    a: 1,
    e: 'Kepatuhan berkaitan dengan menjalankan aturan dan ketentuan, sedangkan etika berkaitan dengan melakukan hal yang benar.'
  },
  {
    q: 'Mengapa integritas sangat penting dalam industri perbankan?',
    o: [
      'Agar pegawai terlihat lebih profesional.',
      'Karena bank hanya dapat beroperasi dengan teknologi yang baik.',
      'Karena kepercayaan merupakan fondasi hubungan antara bank dan nasabah.',
      'Agar seluruh keputusan dapat dibuat lebih cepat.'
    ],
    a: 2,
    e: 'Bank mengelola dana dan informasi nasabah. Kepercayaan merupakan fondasi utama keberlangsungan bank.'
  },
  {
    q: 'Seorang pegawai tetap mengikuti prosedur dan melakukan tindakan yang benar meskipun tidak ada atasan atau auditor yang mengawasi. Perilaku tersebut paling mencerminkan:',
    o: ['Konformitas', 'Integritas', 'Konflik kepentingan', 'Rasionalisasi'],
    a: 1,
    e: 'Integritas terlihat dari konsistensi antara nilai, perkataan, dan tindakan, termasuk ketika tidak diawasi.'
  },
  {
    q: 'Seorang pegawai menemukan celah dalam prosedur yang memungkinkan suatu tindakan dilakukan tanpa melanggar aturan tertulis. Namun, tindakan tersebut berpotensi merugikan nasabah. Apa tindakan yang paling tepat?',
    o: [
      'Melanjutkan karena tidak melanggar aturan tertulis.',
      'Melanjutkan jika menguntungkan bank.',
      'Menilai dampak etisnya dan berkonsultasi sebelum bertindak.',
      'Mengikuti tindakan pegawai lain.'
    ],
    a: 2,
    e: 'Legal belum tentu etis. Selain aturan, pegawai perlu mempertimbangkan dampak dan kepentingan pihak yang terdampak.'
  },
  {
    q: 'Manakah berikut ini yang BUKAN termasuk prinsip utama Good Corporate Governance?',
    o: ['Transparency', 'Accountability', 'Independency', 'Popularity'],
    a: 3,
    e: 'Prinsip GCG mencakup Transparency, Accountability, Responsibility, Independency, dan Fairness.'
  },
  {
    q: 'Dalam Three Lines Model, unit bisnis dan operasional terutama memiliki peran:',
    o: [
      'Memberikan audit independen.',
      'Memiliki dan mengelola risiko serta menjalankan pengendalian sehari-hari.',
      'Menetapkan seluruh kebijakan regulator.',
      'Menggantikan fungsi kepatuhan.'
    ],
    a: 1,
    e: 'Lini pertama menjalankan aktivitas sekaligus menjadi benteng pertama dalam pengelolaan risiko dan pengendalian.'
  },
  {
    q: 'Seorang pegawai terlibat dalam proses evaluasi perusahaan yang dimiliki anggota keluarganya sebagai calon vendor bank. Apa tindakan yang paling tepat?',
    o: [
      'Tetap terlibat karena yakin objektif.',
      'Tidak perlu melapor jika tidak menerima keuntungan.',
      'Mengungkapkan potensi benturan kepentingan dan mengikuti mekanisme yang berlaku.',
      'Menyembunyikan hubungan tersebut.'
    ],
    a: 2,
    e: 'Potensi konflik kepentingan perlu diungkapkan agar keputusan tetap objektif dan dapat dipertanggungjawabkan.'
  },
  {
    q: 'Seorang vendor memberikan hadiah bernilai cukup besar kepada pegawai yang sedang terlibat dalam proses pemilihan vendor. Tindakan paling tepat adalah:',
    o: [
      'Menerima karena diberikan sukarela.',
      'Menerima tetapi tidak memberitahukan siapa pun.',
      'Menilai berdasarkan ketentuan, serta menolak atau melaporkan sesuai prosedur.',
      'Memberikan hadiah kepada rekan kerja.'
    ],
    a: 2,
    e: 'Hadiah dapat menimbulkan konflik kepentingan atau memengaruhi objektivitas. Prinsipnya: kenali, nilai, tolak bila perlu, dan laporkan.'
  },
  {
    q: 'Seorang pegawai ingin menyelesaikan pekerjaan di rumah lalu mengirim data nasabah ke email pribadinya. Tindakan tersebut:',
    o: [
      'Diperbolehkan jika setelah jam kantor.',
      'Diperbolehkan jika tidak dibagikan kepada orang lain.',
      'Berisiko melanggar prinsip perlindungan dan kerahasiaan data.',
      'Selalu diperbolehkan dengan perangkat pribadi.'
    ],
    a: 2,
    e: 'Data nasabah merupakan amanah dan harus digunakan serta dikirim sesuai prosedur dan ketentuan keamanan informasi.'
  },
  {
    q: "Seorang pegawai mengalami masalah keuangan, memiliki akses terhadap sistem dengan pengawasan lemah, dan berpikir bahwa ia hanya 'meminjam sementara' uang perusahaan. Situasi tersebut menggambarkan:",
    o: ['Fraud Triangle', 'Three Lines Model', 'PLUS Filter', 'Ethical Leadership'],
    a: 0,
    e: 'Fraud Triangle terdiri dari Pressure, Opportunity, dan Rationalization.'
  },
  {
    q: "Seorang pegawai mengatakan: 'Ini hanya sedikit penyesuaian angka agar target terlihat tercapai.' Padahal informasi menjadi tidak akurat. Situasi tersebut merupakan contoh:",
    o: ['Ethical fading', 'Transparency', 'Accountability', 'Fairness'],
    a: 0,
    e: "Ethical fading terjadi ketika aspek moral tindakan disamarkan, misalnya manipulasi disebut sebagai 'penyesuaian angka'."
  },
  {
    q: 'Seorang pegawai awalnya melanggar prosedur kecil, lalu tindakan tersebut menjadi kebiasaan dan berkembang menjadi pelanggaran lebih serius. Fenomena tersebut disebut:',
    o: ['Psychological safety', 'Slippery slope', 'Transparency', 'Independency'],
    a: 1,
    e: 'Slippery slope menggambarkan kompromi kecil yang dinormalisasi dan berkembang menjadi pelanggaran lebih besar.'
  },
  {
    q: 'Pegawai memeriksa apakah tindakan sesuai kebijakan, legal, sesuai nilai universal, dan sesuai hati nurani. Kerangka tersebut adalah:',
    o: ['Fraud Pentagon', 'Three Lines Model', 'PLUS Filter', 'Fraud Triangle'],
    a: 2,
    e: 'PLUS Filter terdiri dari Policy, Legal, Universal, dan Self.'
  },
  {
    q: 'Pegawai menemukan indikasi rekannya berpotensi melanggar ketentuan tetapi takut dianggap tidak loyal. Tindakan paling sesuai adalah:',
    o: [
      'Diam agar hubungan baik.',
      'Menyebarkan informasi ke seluruh pegawai.',
      'Menggunakan saluran pelaporan atau mekanisme speak-up yang tersedia.',
      'Membagikan informasi di media sosial.'
    ],
    a: 2,
    e: 'Speak-up dan whistleblowing dilakukan melalui saluran yang tepat untuk membantu melindungi organisasi dari risiko.'
  },
  {
    q: 'Atasan meminta bawahan mempercepat proses dengan melewati tahapan pengendalian. Bawahan menilai tindakan itu berisiko dan tidak sesuai prosedur. Respons terbaik adalah:',
    o: [
      'Langsung mengikuti instruksi atasan.',
      'Menolak secara emosional.',
      'Meminta klarifikasi, merujuk ketentuan, menjelaskan risiko, menawarkan alternatif, dan melakukan eskalasi bila diperlukan.',
      'Mengikuti instruksi tanpa dokumentasi.'
    ],
    a: 2,
    e: 'Keberanian moral dilakukan secara profesional: klarifikasi, rujuk aturan, jelaskan risiko, tawarkan alternatif, eskalasi bila perlu, dan dokumentasikan sesuai ketentuan.'
  }
];

const letters = ['A', 'B', 'C', 'D'];

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=UTF-8',
      'cache-control': 'no-store',
      ...headers,
    },
  });
}

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const bytes = new Uint32Array(1);
    crypto.getRandomValues(bytes);
    const j = bytes[0] % (i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export class QuizRoom extends HardenedQuizRoom {
  publicState(state, participantId, host = false) {
    const result = super.publicState(state, participantId, host);
    const question = state?.currentIndex >= 0 ? state.questions[state.currentIndex] : null;
    if (question && result.question && (state.phase === 'reveal' || state.phase === 'finished' || host)) {
      result.question.answer = question.a;
      result.question.answerLetter = letters[question.a];
      result.question.explanation = question.e;
    }
    return result;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/create' && request.method === 'POST') {
      const existing = await this.load();
      if (existing) return json({ error: 'Room already exists' }, 409);

      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: 'Payload JSON tidak valid' }, 400);
      }

      const requestedCount = Number(body.questionCount ?? 10);
      const questionCount = Math.max(1, Math.min(COC_QUESTIONS.length, Number.isFinite(requestedCount) ? requestedCount : 10));
      const requestedDuration = Number(body.duration ?? 20);
      const duration = Math.max(10, Math.min(90, Number.isFinite(requestedDuration) ? requestedDuration : 20));
      const questions = shuffle(COC_QUESTIONS).slice(0, questionCount);
      const incomingTitle = String(body.title || '').trim();
      const title = (!incomingTitle || incomingTitle === 'QAIP Live Challenge')
        ? 'Code of Conduct & Business Ethics Challenge'
        : incomingTitle.slice(0, 80);

      await this.save({
        code: body.code,
        title,
        hostToken: body.hostToken,
        duration,
        questions,
        phase: 'lobby',
        currentIndex: -1,
        questionStartedAt: 0,
        participants: {},
        answers: {},
        createdAt: Date.now(),
      });
      return json({ ok: true });
    }

    return super.fetch(request);
  }
}

function patchCocHtml(html) {
  return html
    .replace('Live · QAIP Training', 'Live · Code of Conduct & Business Ethics')
    .replace('Quiz kompetitif untuk training internal audit. Poin ditentukan oleh ketepatan dan kecepatan, lengkap dengan pembahasan serta leaderboard langsung.', 'Quiz kompetitif untuk training Code of Conduct & Business Ethics. Poin ditentukan oleh ketepatan dan kecepatan, lengkap dengan pembahasan serta leaderboard langsung.')
    .replace('<strong>50</strong><span>Soal QAIP & GIAS tersedia</span>', '<strong>15</strong><span>Soal Code of Conduct & Business Ethics tersedia</span>')
    .replace('value="QAIP Live Challenge"', 'value="Code of Conduct & Business Ethics Challenge"')
    .replace('<select id="count"><option>5</option><option selected>10</option><option>15</option><option>20</option><option>25</option><option>30</option><option>40</option><option>50</option></select>', '<select id="count"><option>5</option><option>10</option><option selected>15</option></select>');
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return json({
        status: 'ok',
        service: 'cocquiz',
        questionBank: 'Code of Conduct & Business Ethics',
        questions: COC_QUESTIONS.length,
      });
    }

    const response = await hardenedWorker.fetch(request, env, ctx);
    const contentType = response.headers.get('content-type') || '';
    if ((url.pathname === '/' || url.pathname === '/login') && contentType.includes('text/html')) {
      const headers = new Headers(response.headers);
      headers.set('cache-control', 'no-store');
      return new Response(patchCocHtml(await response.text()), {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    }

    return response;
  },
};

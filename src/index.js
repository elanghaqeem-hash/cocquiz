export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ status: "ok", service: "cocquiz" }), {
        headers: { "content-type": "application/json; charset=UTF-8" }
      });
    }

    return new Response("COC Quiz deployment is working.", {
      headers: { "content-type": "text/plain; charset=UTF-8" }
    });
  }
};

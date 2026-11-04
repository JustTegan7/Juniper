/* Juniper booking embed. Usage:
   <div data-juniper-booking="your-link-name"></div>
   <script src="https://YOUR-JUNIPER-DOMAIN/embed.js" async></script>
   Optional: add data-theme="light" or data-theme="dark" to the div to force a theme.
   Without it the form follows the visitor's device setting. */
(function () {
  var script = document.currentScript;
  var origin = script ? new URL(script.src).origin : "";
  function mount(el) {
    if (el.getAttribute("data-juniper-ready")) return;
    var slug = el.getAttribute("data-juniper-booking");
    if (!slug || !/^[a-z0-9-]{1,40}$/.test(slug)) return;
    el.setAttribute("data-juniper-ready", "1");
    var frame = document.createElement("iframe");
    var theme = el.getAttribute("data-theme");
    var query = theme === "light" || theme === "dark" ? "?theme=" + theme : "";
    frame.src = origin + "/embed/" + slug + query;
    frame.title = "Book an appointment";
    frame.loading = "lazy";
    frame.style.cssText = "width:100%;border:0;min-height:520px;display:block;color-scheme:normal";
    frame.setAttribute("allow", "clipboard-write");
    el.appendChild(frame);
    window.addEventListener("message", function (e) {
      if (e.origin !== origin || e.source !== frame.contentWindow) return;
      var d = e.data || {};
      if (d.type === "juniper:height" && typeof d.height === "number") frame.style.height = Math.max(400, Math.ceil(d.height)) + "px";
    });
  }
  function run() {
    var els = document.querySelectorAll("[data-juniper-booking]");
    for (var i = 0; i < els.length; i++) mount(els[i]);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run);
  else run();
})();

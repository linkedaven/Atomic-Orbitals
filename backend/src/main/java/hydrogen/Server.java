package hydrogen;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.URLDecoder;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicLong;

/**
 * The web server: serves the front-end files and a small JSON/binary API. Built on the JDK's own
 * com.sun.net.httpserver, so there is nothing to download.
 *
 * <pre>
 *   GET /api/orbitals                        the catalogue of 20 subshells / 60 orbitals
 *   GET /api/orbital?id=3dxz&amp;z=1             numbers, nodes and radial tables for one orbital
 *   GET /api/cloud?id=3dxz&amp;count=40000&amp;seed=1 random points distributed as |psi|^2 (binary)
 *   GET /api/slice?id=3dxz&amp;plane=xz&amp;res=121   psi on a plane through the nucleus
 * </pre>
 */
public final class Server {
    public static final int DEFAULT_PORT = 8005;
    public static final double RYDBERG_EV = 13.605693122994;
    static final int MAX_Z = 118;
    static final int MIN_COUNT = 100, MAX_COUNT = 200000;
    static final int MIN_RES = 21, MAX_RES = 401;
    static final int RADIAL_POINTS = 400;

    /** An error that is reported to the browser as {"error": message} with the given HTTP status. */
    static final class ApiException extends RuntimeException {
        private static final long serialVersionUID = 1L;
        final int status;

        ApiException(int status, String message) {
            super(message);
            this.status = status;
        }
    }

    private final HttpServer http;
    private final Path frontend;
    private final AtomicLong lastPing = new AtomicLong(System.currentTimeMillis());
    private final AtomicLong byeAt = new AtomicLong(0);

    private Server(HttpServer http, Path frontend) {
        this.http = http;
        this.frontend = frontend == null ? null : frontend.toAbsolutePath().normalize();
    }

    /**
     * Starts listening on 127.0.0.1. Pass port 0 to let the system choose a free port.
     * With a null frontend folder the pages are served from the copy packed inside the jar.
     */
    public static Server start(int port, Path frontend) throws IOException {
        HttpServer http = HttpServer.create(new InetSocketAddress(InetAddress.getLoopbackAddress(), port), 0);
        Server s = new Server(http, frontend);
        http.createContext("/", ex -> s.guard(ex, s::serveStatic));
        http.createContext("/api/orbitals", ex -> s.guard(ex, s::apiOrbitals));
        http.createContext("/api/orbital", ex -> s.guard(ex, s::apiOrbital));
        http.createContext("/api/cloud", ex -> s.guard(ex, s::apiCloud));
        http.createContext("/api/slice", ex -> s.guard(ex, s::apiSlice));
        http.createContext("/api/ping", ex -> s.guard(ex, s::apiPing));
        http.createContext("/api/bye", ex -> s.guard(ex, s::apiBye));
        http.setExecutor(Executors.newFixedThreadPool(4, r -> {
            Thread t = new Thread(r, "http");
            t.setDaemon(true);
            return t;
        }));
        http.start();
        return s;
    }

    public int port() {
        return http.getAddress().getPort();
    }

    public void stop() {
        http.stop(0);
    }

    /** True when the page has said goodbye (tab closed) and the grace period is over, or has not pinged for two minutes. */
    public boolean shouldQuit(long now) {
        long bye = byeAt.get();
        return (bye > 0 && now > bye) || now - lastPing.get() > 120_000;
    }

    // ------------------------------------------------------------------ plumbing
    private interface Handler {
        void handle(HttpExchange ex) throws Exception;
    }

    private void guard(HttpExchange ex, Handler h) throws IOException {
        try {
            if (!"GET".equals(ex.getRequestMethod()) && !"POST".equals(ex.getRequestMethod())) {
                throw new ApiException(405, "Only GET and POST are supported.");
            }
            h.handle(ex);
        } catch (ApiException e) {
            sendJson(ex, e.status, Map.of("error", e.getMessage()));
        } catch (Exception e) {
            e.printStackTrace();
            sendJson(ex, 500, Map.of("error", "Internal error: " + e.getClass().getSimpleName()));
        } finally {
            ex.close();
        }
    }

    private static void send(HttpExchange ex, int status, String type, byte[] body) throws IOException {
        ex.getResponseHeaders().set("Content-Type", type);
        ex.getResponseHeaders().set("Cache-Control", "no-store");
        ex.sendResponseHeaders(status, body.length == 0 ? -1 : body.length);
        if (body.length > 0) {
            try (OutputStream os = ex.getResponseBody()) {
                os.write(body);
            }
        }
    }

    private static void sendJson(HttpExchange ex, int status, Object value) throws IOException {
        send(ex, status, "application/json; charset=utf-8", Json.stringify(value).getBytes(StandardCharsets.UTF_8));
    }

    private static Map<String, String> query(URI uri) {
        Map<String, String> q = new LinkedHashMap<>();
        String raw = uri.getRawQuery();
        if (raw == null || raw.isEmpty()) return q;
        for (String part : raw.split("&")) {
            int eq = part.indexOf('=');
            String k = eq < 0 ? part : part.substring(0, eq), v = eq < 0 ? "" : part.substring(eq + 1);
            q.put(URLDecoder.decode(k, StandardCharsets.UTF_8), URLDecoder.decode(v, StandardCharsets.UTF_8));
        }
        return q;
    }

    private static Orbital orbitalParam(Map<String, String> q) {
        String id = q.get("id");
        if (id == null || id.isEmpty()) throw new ApiException(400, "Missing parameter: id (for example id=3dxz).");
        Orbital o = Orbitals.byId(id);
        if (o == null) throw new ApiException(400, "Unknown orbital \"" + id + "\". See /api/orbitals for the list.");
        return o;
    }

    private static int intParam(Map<String, String> q, String name, int def, int min, int max) {
        String raw = q.get(name);
        if (raw == null || raw.isEmpty()) return def;
        long v;
        try {
            double d = Double.parseDouble(raw);
            if (d != Math.rint(d) || Double.isInfinite(d)) throw new NumberFormatException();
            v = (long) d;
        } catch (NumberFormatException e) {
            throw new ApiException(400, name + " must be a whole number.");
        }
        if (v < min || v > max) throw new ApiException(400, name + " must be between " + min + " and " + max + ".");
        return (int) v;
    }

    // ------------------------------------------------------------------ static files
    private static String mime(String name) {
        String n = name.toLowerCase();
        if (n.endsWith(".html")) return "text/html; charset=utf-8";
        if (n.endsWith(".css")) return "text/css; charset=utf-8";
        if (n.endsWith(".js")) return "text/javascript; charset=utf-8";
        if (n.endsWith(".json")) return "application/json; charset=utf-8";
        if (n.endsWith(".svg")) return "image/svg+xml";
        if (n.endsWith(".png")) return "image/png";
        if (n.endsWith(".ico")) return "image/x-icon";
        return "application/octet-stream";
    }

    private void serveStatic(HttpExchange ex) throws Exception {
        String path = URLDecoder.decode(ex.getRequestURI().getRawPath(), StandardCharsets.UTF_8);
        if (path.equals("/")) path = "/index.html";
        if (path.contains("\u0000") || path.contains("\\")) throw new ApiException(400, "Bad path.");
        if (frontend == null) {                       // the copy packed inside the jar
            String last = path.substring(path.lastIndexOf('/') + 1);
            if (path.contains("..") || path.contains("//") || !last.contains(".")) throw new ApiException(404, "Not found: " + path);
            try (java.io.InputStream in = Server.class.getResourceAsStream("/frontend" + path)) {
                if (in == null) throw new ApiException(404, "Not found: " + path);
                send(ex, 200, mime(last), in.readAllBytes());
            }
            return;
        }
        Path file = frontend.resolve(path.substring(1)).normalize();
        if (!file.startsWith(frontend) || !Files.isRegularFile(file)) throw new ApiException(404, "Not found: " + path);
        send(ex, 200, mime(file.getFileName().toString()), Files.readAllBytes(file));
    }

    // ------------------------------------------------------------------ watchdog endpoints
    private void apiPing(HttpExchange ex) throws IOException {
        lastPing.set(System.currentTimeMillis());
        byeAt.set(0);
        sendJson(ex, 200, Map.of("ok", true));
    }

    private void apiBye(HttpExchange ex) throws IOException {
        byeAt.set(System.currentTimeMillis() + 5000);
        sendJson(ex, 200, Map.of("ok", true));
    }

    // ------------------------------------------------------------------ /api/orbitals
    private void apiOrbitals(HttpExchange ex) throws IOException {
        List<Object> subs = new ArrayList<>();
        for (Orbitals.Subshell s : Orbitals.subshells()) {
            List<Object> orbs = new ArrayList<>();
            for (Orbital o : s.orbitals()) {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("id", o.id());
                m.put("label", o.label());
                m.put("sub", o.angular().sub);
                orbs.add(m);
            }
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("shell", s.shell());
            m.put("n", s.n());
            m.put("l", s.l());
            m.put("orbitals", orbs);
            subs.add(m);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("count", Orbitals.all().size());
        out.put("subshells", subs);
        sendJson(ex, 200, out);
    }

    // ------------------------------------------------------------------ /api/orbital
    private void apiOrbital(HttpExchange ex) throws IOException {
        Map<String, String> q = query(ex.getRequestURI());
        Orbital o = orbitalParam(q);
        int z = intParam(q, "z", 1, 1, MAX_Z);
        sendJson(ex, 200, describe(o, z));
    }

    static Map<String, Object> describe(Orbital o, int z) {
        int n = o.n(), l = o.l();
        Radial.Info info = Radial.info(n, l);
        double[] nodes = info.nodes, nodesA0 = new double[nodes.length];
        for (int i = 0; i < nodes.length; i++) nodesA0[i] = nodes[i] / z;

        double[] sigma = new double[RADIAL_POINTS], r = new double[RADIAL_POINTS];
        double[] radial = new double[RADIAL_POINTS], prob = new double[RADIAL_POINTS];
        for (int i = 0; i < RADIAL_POINTS; i++) {
            double s = info.extent * i / (RADIAL_POINTS - 1);
            double rv = Radial.value(n, l, s);
            sigma[i] = s;
            r[i] = s / z;                       // r in units of a0
            radial[i] = rv;                     // R without the factor (Z/a0)^(3/2)
            prob[i] = z * s * s * rv * rv;      // r^2 R^2 in 1/a0, since r = sigma / Z
        }
        Map<String, Object> radialTable = new LinkedHashMap<>();
        radialTable.put("sigma", sigma);
        radialTable.put("r", r);
        radialTable.put("R", radial);
        radialTable.put("P", prob);

        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", o.id());
        m.put("label", o.label());
        m.put("shell", o.shell());
        m.put("sub", o.angular().sub);
        m.put("n", n);
        m.put("l", l);
        m.put("z", z);
        m.put("energyEV", -RYDBERG_EV * z * (double) z / ((double) n * n));
        m.put("radialNodes", o.radialNodes());
        m.put("angularNodes", l);
        m.put("totalNodes", n - 1);
        m.put("radialFormula", DocFormulas.get(n, l).text());
        m.put("angularFormula", o.angular().formula);
        m.put("nodesSigma", nodes);
        m.put("nodesA0", nodesA0);
        m.put("meanSigma", Radial.meanSigma(n, l));
        m.put("meanA0", Radial.meanSigma(n, l) / z);
        m.put("peakSigma", info.peak);
        m.put("peakA0", info.peak / z);
        m.put("extentSigma", info.extent);
        m.put("extentA0", info.extent / z);
        m.put("radial", radialTable);
        return m;
    }

    // ------------------------------------------------------------------ /api/cloud
    /**
     * Binary reply, little endian: int32 N, then N points as float32 x, y, z (sigma units), then N int8 signs of psi.
     */
    private void apiCloud(HttpExchange ex) throws IOException {
        Map<String, String> q = query(ex.getRequestURI());
        Orbital o = orbitalParam(q);
        int count = intParam(q, "count", 40000, MIN_COUNT, MAX_COUNT);
        long seed = q.containsKey("seed") ? intParam(q, "seed", 1, 0, Integer.MAX_VALUE) : System.nanoTime();
        Sampler.Cloud c = Sampler.sample(o, count, seed);
        ByteBuffer buf = ByteBuffer.allocate(4 + 12 * count + count).order(ByteOrder.LITTLE_ENDIAN);
        buf.putInt(count);
        for (float f : c.xyz()) buf.putFloat(f);
        buf.put(c.sign());
        ex.getResponseHeaders().set("X-Extent-Sigma", Double.toString(Radial.info(o.n(), o.l()).extent));
        send(ex, 200, "application/octet-stream", buf.array());
    }

    // ------------------------------------------------------------------ /api/slice
    private void apiSlice(HttpExchange ex) throws IOException {
        Map<String, String> q = query(ex.getRequestURI());
        Orbital o = orbitalParam(q);
        String plane = q.getOrDefault("plane", "xz");
        if (!plane.equals("xy") && !plane.equals("xz") && !plane.equals("yz")) {
            throw new ApiException(400, "plane must be xy, xz or yz.");
        }
        int res = intParam(q, "res", 121, MIN_RES, MAX_RES);
        int z = intParam(q, "z", 1, 1, MAX_Z);
        sendJson(ex, 200, slice(o, plane, res, z));
    }

    /**
     * psi on a square through the nucleus, with the horizontal axis first (x for xy and xz, y for yz) and the
     * vertical axis second. Row 0 is the top. Values are divided by the largest |psi| on the slice.
     */
    static Map<String, Object> slice(Orbital o, String plane, int res, int z) {
        double e = Radial.info(o.n(), o.l()).extent;
        double[] vals = new double[res * res];
        double max = 0.0;
        for (int i = 0; i < res; i++) {
            double v = e * (1.0 - 2.0 * (i + 0.5) / res);
            for (int j = 0; j < res; j++) {
                double h = e * (-1.0 + 2.0 * (j + 0.5) / res), x, y, zz;
                switch (plane) {
                    case "xy" -> { x = h; y = v; zz = 0; }
                    case "yz" -> { x = 0; y = h; zz = v; }
                    default -> { x = h; y = 0; zz = v; }
                }
                double psi = Wavefunction.psi(o, x, y, zz);
                vals[i * res + j] = psi;
                max = Math.max(max, Math.abs(psi));
            }
        }
        if (max > 0) {
            for (int i = 0; i < vals.length; i++) vals[i] = Math.round(vals[i] / max * 10000.0) / 10000.0;
        }
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", o.id());
        m.put("plane", plane);
        m.put("res", res);
        m.put("extentSigma", e);
        m.put("extentA0", e / z);
        m.put("max", max);
        m.put("psi", vals);
        return m;
    }
}

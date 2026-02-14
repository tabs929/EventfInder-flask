import os, requests
from flask import Flask, render_template, request, jsonify
from requests.exceptions import RequestException, Timeout

TM_BASE = "https://app.ticketmaster.com/discovery/v2"
TM_KEY  = os.environ.get("TM_API_KEY")

app = Flask(__name__, static_url_path="/static")

@app.get("/")
def index():
    return render_template("index.html")

@app.get("/test")
def test():
    sample_params = {
        "keyword": "Concert",
        "geoPoint": "9q5ct",  
        "radius": "10",
        "unit": "miles",
        "segmentId": "KZFzniwnSyZfZ7v7nJ"  
    }
    return _proxy_tm("/events.json", sample_params)

def _tm_key_required():
    if not TM_KEY:
        return jsonify({"error":"Server misconfigured: TM_API_KEY missing"}), 500
    return None

def _proxy_tm(path: str, params: dict):
    missing = _tm_key_required()
    if missing: return missing
    try:
        r = requests.get(f"{TM_BASE}{path}", params={"apikey": TM_KEY, **params}, timeout=10)
        data = r.json()
        if r.status_code >= 500:
            return jsonify({"error":"Upstream Ticketmaster error","upstream":data}), r.status_code
        return jsonify(data), r.status_code
    except Timeout:
        return jsonify({"error":"Ticketmaster request timed out"}), 504
    except RequestException as e:
        return jsonify({"error":f"Ticketmaster request failed: {e}"}), 502

@app.get("/search")
def search():
    params = {
        "keyword": request.args.get("keyword",""),
        "geoPoint": request.args.get("geoPoint"),
        "radius": request.args.get("radius","10"),
        "unit": "miles",
    }
    seg = request.args.get("segmentId")
    if seg: params["segmentId"] = seg
    return _proxy_tm("/events.json", params)

@app.get("/event")
def event():
    event_id = request.args.get("id")
    if not event_id:
        return jsonify({"error":"Missing event id"}), 400
    return _proxy_tm(f"/events/{event_id}.json", {})

@app.get("/venue")
def venue():
    keyword = request.args.get("keyword","")
    return _proxy_tm("/venues.json", {"keyword": keyword})

if __name__ == "__main__":
    app.run(debug=True)
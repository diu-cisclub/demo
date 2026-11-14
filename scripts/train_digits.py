"""Train the tiny digit-reading network shown in the home page hero.

Uses scikit-learn's bundled 8x8 handwritten digits (no download needed),
adds shifted/thickened copies so it copes with mouse/finger drawings,
and exports weights as JSON for the browser.

    python3 scripts/train_digits.py  (writes src/features/neural-hero/weights.json)
"""
import json
from pathlib import Path

import numpy as np
from scipy.ndimage import shift, grey_dilation
from sklearn.datasets import load_digits
from sklearn.model_selection import train_test_split
from sklearn.neural_network import MLPClassifier

OUT = Path(__file__).resolve().parent.parent / "src" / "features" / "neural-hero" / "weights.json"

digits = load_digits()
X = digits.images / 16.0  # (n, 8, 8) in 0..1
y = digits.target

def augment(images, labels):
    rng = np.random.default_rng(7)
    xs, ys = [images], [labels]
    for _ in range(4):
        dx, dy = rng.integers(-1, 2, size=2)
        moved = np.array([shift(img, (dy, dx), order=0, mode="constant") for img in images])
        xs.append(moved); ys.append(labels)
    thick = np.array([np.clip(grey_dilation(img, size=(2, 2)), 0, 1) for img in images])
    xs.append(thick); ys.append(labels)
    return np.concatenate(xs), np.concatenate(ys)

X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=0, stratify=y)
X_train, y_train = augment(X_train, y_train)

model = MLPClassifier(hidden_layer_sizes=(16, 12), activation="relu", max_iter=600,
                      alpha=1e-3, random_state=0)
model.fit(X_train.reshape(len(X_train), -1), y_train)
acc = model.score(X_test.reshape(len(X_test), -1), y_test)
print(f"test accuracy: {acc:.3f}")

r = lambda a: np.round(a, 4).tolist()
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps({
    "layers": [{"W": r(W.T), "b": r(b)} for W, b in zip(model.coefs_, model.intercepts_)],
    "inputSize": 8, "accuracy": round(acc, 3),
}, separators=(",", ":")))
print("wrote", OUT)

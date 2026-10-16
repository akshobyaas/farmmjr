# Phase 9 v2 — Training Report

Adds Arecanut (Yellow Leaf Disease, Mahali/Koleroga) to v1's Pepper + Rice coverage — 9 classes total. Cocoa Black Pod was scoped for this retrain but did not make it in: the only available public Cocoa dataset turned out to be in YOLO object-detection format (images/ + labels/, not a folder per class), which this pipeline cannot read — a real follow-up, not an oversight. Arecanut Foot Rot, Cocoa Black Pod, and Cocoa VSD all remain uncovered.

Test accuracy: 0.9368

Test loss: 0.1793

## Classification Report

```
                                precision    recall  f1-score   support

    Arecanut___Mahali_Koleroga      1.000     0.867     0.929        15
Arecanut___Yellow_Leaf_Disease      0.889     1.000     0.941         8
             Pepper___Foot_Rot      0.879     0.967     0.921        60
        Pepper___Pollu_Disease      0.937     0.983     0.959        60
         Pepper___Slow_Decline      1.000     0.850     0.919        60
  Rice___Bacterial_Leaf_Blight      0.933     0.933     0.933        60
                  Rice___Blast      0.898     0.883     0.891        60
             Rice___Brown_Spot      0.934     0.950     0.942        60
                 Rice___Tungro      0.984     1.000     0.992        60

                      accuracy                          0.937       443
                     macro avg      0.939     0.937     0.936       443
                  weighted avg      0.939     0.937     0.937       443

```

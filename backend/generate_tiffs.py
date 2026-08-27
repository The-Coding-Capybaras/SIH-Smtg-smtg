import rasterio
from rasterio.transform import from_bounds
import numpy as np
import os

# Chennai Bounds: West 80.20, South 13.00, East 80.30, North 13.10
# Resolution: 200x200 pixels
transform = from_bounds(80.20, 13.00, 80.30, 13.10, 200, 200)

# Create Fake Optical (3 Band RGB)
optical_data = np.zeros((3, 200, 200), dtype=np.uint8)
for i in range(200):
    for j in range(200):
        if j > 120:
            # Water (Blue)
            optical_data[0, i, j] = 20
            optical_data[1, i, j] = 40
            optical_data[2, i, j] = 200
        else:
            # Land (Green)
            optical_data[0, i, j] = 30
            optical_data[1, i, j] = 150
            optical_data[2, i, j] = 50

# Add a fake "building/infrastructure"
optical_data[:, 80:120, 40:80] = 180

with rasterio.open(
    '/Users/mb/Desktop/Optical_Sample.tif',
    'w',
    driver='GTiff',
    height=200,
    width=200,
    count=3,
    dtype=optical_data.dtype,
    crs='EPSG:4326',
    transform=transform,
) as dst:
    dst.write(optical_data)

# Create Fake SAR (1 Band Greyscale)
sar_data = np.zeros((1, 200, 200), dtype=np.uint8)
# Water is very dark in SAR (low backscatter/specular reflection)
sar_data[0, :, 120:] = 10
# Land is medium backscatter
sar_data[0, :, :120] = 100
# The building has HIGH backscatter in SAR (double bounce from urban structures)
sar_data[0, 80:120, 40:80] = 255

with rasterio.open(
    '/Users/mb/Desktop/SAR_Sample.tif',
    'w',
    driver='GTiff',
    height=200,
    width=200,
    count=1,
    dtype=sar_data.dtype,
    crs='EPSG:4326',
    transform=transform,
) as dst:
    dst.write(sar_data)

print("TIFFs generated!")

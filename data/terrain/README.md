# Terrain material atlas

`ground_pbr_atlas.png` is packed from the Unity project’s `PBR Ground Materials #1 [Dirt& Grass]` package. It contains the 30 dirt and 10 grass material variants at 448 × 448 texels per map, with 32 px edge padding inside each 512 px slot.

For each material, the first slot contains diffuse RGB and ambient occlusion in alpha. The next slot contains normal XY, height in blue, and grayscale specular in alpha. The terrain shader reads both through the existing material `map` sampler. It converts diffuse colors from sRGB, uses AO for occlusion, height for relief, the normal map for surface normals, and the specular map to vary roughness.

Atlas slots 80 and 81 are filled at runtime with Eldermere’s existing flagstone and hand-painted stone textures. This keeps those surfaces while avoiding an extra texture sampler. The Unity asset license still applies to the source textures.

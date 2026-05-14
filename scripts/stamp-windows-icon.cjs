const fs = require("fs");
const path = require("path");
const ResEdit = require("resedit");

exports.default = async function stampWindowsIcon(context) {
  if (context.electronPlatformName !== "win32") {
    return;
  }

  const productName = context.packager.appInfo.productFilename;
  const exePath = path.join(context.appOutDir, `${productName}.exe`);
  const iconPath = path.join(context.packager.projectDir, "build", "icon.ico");

  if (!fs.existsSync(exePath)) {
    throw new Error(`[stamp-windows-icon] Missing executable: ${exePath}`);
  }

  if (!fs.existsSync(iconPath)) {
    throw new Error(`[stamp-windows-icon] Missing icon: ${iconPath}`);
  }

  const exe = ResEdit.NtExecutable.from(fs.readFileSync(exePath), {
    ignoreCert: true,
  });
  const resources = ResEdit.NtExecutableResource.from(exe);
  const iconFile = ResEdit.Data.IconFile.from(fs.readFileSync(iconPath));

  ResEdit.Resource.IconGroupEntry.replaceIconsForResource(
    resources.entries,
    1,
    1033,
    iconFile.icons.map((item) => item.data)
  );

  resources.outputResource(exe);
  fs.writeFileSync(exePath, Buffer.from(exe.generate()));
  console.log(`[stamp-windows-icon] Stamped ${iconPath} into ${exePath}`);
};

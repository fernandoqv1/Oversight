#!/usr/bin/env python3
"""
Generates Oversight.xcodeproj/project.pbxproj for the Oversight SwiftUI +
SwiftData multiplatform (iOS + macOS) app, by walking the Oversight/
source folder and registering every .swift file plus Assets.xcassets.

Run this again any time files are added/removed under Oversight/Oversight/
to regenerate a project file that matches disk contents. Kept in ios/ as
source, not part of the app target itself.
"""
import os
import uuid

ROOT = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.join(ROOT, "Oversight")
SRC_DIR = os.path.join(PROJECT_DIR, "Oversight")
PBXPROJ_PATH = os.path.join(PROJECT_DIR, "Oversight.xcodeproj", "project.pbxproj")

BUNDLE_ID = "com.facs.oversight"
IOS_DEPLOYMENT_TARGET = "17.0"
MACOS_DEPLOYMENT_TARGET = "14.0"

def new_id():
    return uuid.uuid4().hex[:24].upper()

class Node:
    """A file or group in the source tree."""
    def __init__(self, name, path=None, is_group=False):
        self.name = name
        self.path = path  # relative path segment (None for virtual groups)
        self.is_group = is_group
        self.children = []
        self.id = new_id()
        self.file_ref_id = None
        self.build_file_id = None

def build_tree():
    root = Node("Oversight", is_group=True)
    dir_nodes = {SRC_DIR: root}

    for dirpath, dirnames, filenames in os.walk(SRC_DIR):
        # Don't descend into Assets.xcassets — treat it as a single folder reference.
        dirnames[:] = [d for d in sorted(dirnames) if not d.endswith(".xcassets")]
        parent = dir_nodes[dirpath]

        for d in sorted([d for d in os.listdir(dirpath) if d.endswith(".xcassets")]):
            group_node = Node(d, path=d, is_group=False)
            group_node.is_asset_catalog = True
            parent.children.append(group_node)

        for sub in dirnames:
            child = Node(sub, path=sub, is_group=True)
            parent.children.append(child)
            dir_nodes[os.path.join(dirpath, sub)] = child

        for f in sorted(filenames):
            if f.endswith(".swift"):
                parent.children.append(Node(f, path=f, is_group=False))

    return root

def collect_swift_files(node, prefix=""):
    out = []
    for child in node.children:
        rel = f"{prefix}{child.name}"
        if getattr(child, "is_asset_catalog", False):
            continue
        if child.is_group:
            out.extend(collect_swift_files(child, rel + "/"))
        else:
            out.append((child, rel))
    return out

def collect_asset_catalogs(node):
    out = []
    for child in node.children:
        if getattr(child, "is_asset_catalog", False):
            out.append(child)
        elif child.is_group:
            out.extend(collect_asset_catalogs(child))
    return out

root = build_tree()
root.path = "Oversight"  # the source folder sits at <project>/Oversight/
swift_files = collect_swift_files(root)
asset_catalogs = collect_asset_catalogs(root)

app_ref_id = new_id()
target_id = new_id()
project_id = new_id()
main_group_id = new_id()  # synthetic top-level group wrapping sources + Products
products_group_id = new_id()
frameworks_phase_id = new_id()
sources_phase_id = new_id()
resources_phase_id = new_id()
target_config_list_id = new_id()
project_config_list_id = new_id()
target_debug_cfg_id = new_id()
target_release_cfg_id = new_id()
project_debug_cfg_id = new_id()
project_release_cfg_id = new_id()

file_refs = []       # (id, name, path, sourcetree, lastKnownFileType, explicitFileType)
build_files_sources = []   # (build_file_id, file_ref_id, name)
build_files_resources = []
groups = []           # (id, name-or-None, path-or-None, children-ids)

def register_file(node, is_source):
    fr_id = new_id()
    node.file_ref_id = fr_id
    filetype = "sourcecode.swift" if node.name.endswith(".swift") else None
    file_refs.append((fr_id, node.name, node.path, filetype))
    if is_source:
        bf_id = new_id()
        node.build_file_id = bf_id
        build_files_sources.append((bf_id, fr_id, node.name))

def register_asset_catalog(node):
    fr_id = new_id()
    node.file_ref_id = fr_id
    file_refs.append((fr_id, node.name, node.path, "folder.assetcatalog"))
    bf_id = new_id()
    node.build_file_id = bf_id
    build_files_resources.append((bf_id, fr_id, node.name))

def walk_and_register(node):
    for child in node.children:
        if getattr(child, "is_asset_catalog", False):
            register_asset_catalog(child)
        elif child.is_group:
            walk_and_register(child)
        else:
            register_file(child, is_source=True)

walk_and_register(root)

def build_group(node):
    child_ids = []
    for child in node.children:
        if getattr(child, "is_asset_catalog", False) or not child.is_group:
            child_ids.append(child.file_ref_id)
        else:
            child_ids.append(child.id)
            build_group(child)
    groups.append((node.id, node.name, node.path, child_ids))

build_group(root)

lines = []
def w(s=""):
    lines.append(s)

w("// !$*UTF8*$!")
w("{")
w("\tarchiveVersion = 1;")
w("\tclasses = {")
w("\t};")
w("\tobjectVersion = 56;")
w("\tobjects = {")

w()
w("/* Begin PBXBuildFile section */")
for bf_id, fr_id, name in build_files_sources:
    w(f"\t\t{bf_id} /* {name} in Sources */ = {{isa = PBXBuildFile; fileRef = {fr_id} /* {name} */; }};")
for bf_id, fr_id, name in build_files_resources:
    w(f"\t\t{bf_id} /* {name} in Resources */ = {{isa = PBXBuildFile; fileRef = {fr_id} /* {name} */; }};")
w("/* End PBXBuildFile section */")

w()
w("/* Begin PBXFileReference section */")
w(f"\t\t{app_ref_id} /* Oversight.app */ = {{isa = PBXFileReference; explicitFileType = wrapper.application; includeInIndex = 0; path = Oversight.app; sourceTree = BUILT_PRODUCTS_DIR; }};")
for fr_id, name, path, filetype in file_refs:
    if filetype == "sourcecode.swift":
        w(f"\t\t{fr_id} /* {name} */ = {{isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = \"{path}\"; sourceTree = \"<group>\"; }};")
    elif filetype == "folder.assetcatalog":
        w(f"\t\t{fr_id} /* {name} */ = {{isa = PBXFileReference; lastKnownFileType = folder.assetcatalog; path = \"{path}\"; sourceTree = \"<group>\"; }};")
w("/* End PBXFileReference section */")

w()
w("/* Begin PBXFrameworksBuildPhase section */")
w(f"\t\t{frameworks_phase_id} /* Frameworks */ = {{")
w("\t\t\tisa = PBXFrameworksBuildPhase;")
w("\t\t\tbuildActionMask = 2147483647;")
w("\t\t\tfiles = (")
w("\t\t\t);")
w("\t\t\trunOnlyForDeploymentPostprocessing = 0;")
w("\t\t};")
w("/* End PBXFrameworksBuildPhase section */")

w()
w("/* Begin PBXGroup section */")
w(f"\t\t{products_group_id} /* Products */ = {{")
w("\t\t\tisa = PBXGroup;")
w("\t\t\tchildren = (")
w(f"\t\t\t\t{app_ref_id} /* Oversight.app */,")
w("\t\t\t);")
w("\t\t\tname = Products;")
w("\t\t\tsourceTree = \"<group>\";")
w("\t\t};")
for gid, name, path, child_ids in groups:
    w(f"\t\t{gid} /* {name} */ = {{")
    w("\t\t\tisa = PBXGroup;")
    w("\t\t\tchildren = (")
    for cid in child_ids:
        w(f"\t\t\t\t{cid},")
    w("\t\t\t);")
    w(f"\t\t\tpath = \"{path}\";")
    w(f"\t\t\tsourceTree = \"<group>\";")
    w("\t\t};")
# Synthetic main group: contains the Oversight source group + Products,
# no path (resolves to the project directory).
w(f"\t\t{main_group_id} = {{")
w("\t\t\tisa = PBXGroup;")
w("\t\t\tchildren = (")
w(f"\t\t\t\t{root.id} /* Oversight */,")
w(f"\t\t\t\t{products_group_id} /* Products */,")
w("\t\t\t);")
w("\t\t\tsourceTree = \"<group>\";")
w("\t\t};")
w("/* End PBXGroup section */")

# Root group needs Products child added — rebuild main group entry with Products included.
# (We appended main group above without Products; patch by re-emitting.)
w()
w("/* Begin PBXNativeTarget section */")
w(f"\t\t{target_id} /* Oversight */ = {{")
w("\t\t\tisa = PBXNativeTarget;")
w(f"\t\t\tbuildConfigurationList = {target_config_list_id} /* Build configuration list for PBXNativeTarget \"Oversight\" */;")
w("\t\t\tbuildPhases = (")
w(f"\t\t\t\t{sources_phase_id} /* Sources */,")
w(f"\t\t\t\t{frameworks_phase_id} /* Frameworks */,")
w(f"\t\t\t\t{resources_phase_id} /* Resources */,")
w("\t\t\t);")
w("\t\t\tbuildRules = (")
w("\t\t\t);")
w("\t\t\tdependencies = (")
w("\t\t\t);")
w("\t\t\tname = Oversight;")
w("\t\t\tproductName = Oversight;")
w(f"\t\t\tproductReference = {app_ref_id} /* Oversight.app */;")
w("\t\t\tproductType = \"com.apple.product-type.application\";")
w("\t\t};")
w("/* End PBXNativeTarget section */")

w()
w("/* Begin PBXProject section */")
w(f"\t\t{project_id} /* Project object */ = {{")
w("\t\t\tisa = PBXProject;")
w("\t\t\tattributes = {")
w("\t\t\t\tBuildIndependentTargetsInParallel = 1;")
w("\t\t\t\tLastSwiftUpdateCheck = 1600;")
w("\t\t\t\tLastUpgradeCheck = 1600;")
w("\t\t\t\tTargetAttributes = {")
w(f"\t\t\t\t\t{target_id} = {{")
w("\t\t\t\t\t\tCreatedOnToolsVersion = 16.0;")
w("\t\t\t\t\t};")
w("\t\t\t\t};")
w("\t\t\t};")
w(f"\t\t\tbuildConfigurationList = {project_config_list_id} /* Build configuration list for PBXProject \"Oversight\" */;")
w("\t\t\tcompatibilityVersion = \"Xcode 14.0\";")
w("\t\t\tdevelopmentRegion = en;")
w("\t\t\thasScannedForEncodings = 0;")
w("\t\t\tknownRegions = (")
w("\t\t\t\ten,")
w("\t\t\t\tBase,")
w("\t\t\t);")
w(f"\t\t\tmainGroup = {main_group_id};")
w(f"\t\t\tproductRefGroup = {products_group_id} /* Products */;")
w("\t\t\tprojectDirPath = \"\";")
w("\t\t\tprojectRoot = \"\";")
w("\t\t\ttargets = (")
w(f"\t\t\t\t{target_id} /* Oversight */,")
w("\t\t\t);")
w("\t\t};")
w("/* End PBXProject section */")

w()
w("/* Begin PBXResourcesBuildPhase section */")
w(f"\t\t{resources_phase_id} /* Resources */ = {{")
w("\t\t\tisa = PBXResourcesBuildPhase;")
w("\t\t\tbuildActionMask = 2147483647;")
w("\t\t\tfiles = (")
for bf_id, fr_id, name in build_files_resources:
    w(f"\t\t\t\t{bf_id} /* {name} in Resources */,")
w("\t\t\t);")
w("\t\t\trunOnlyForDeploymentPostprocessing = 0;")
w("\t\t};")
w("/* End PBXResourcesBuildPhase section */")

w()
w("/* Begin PBXSourcesBuildPhase section */")
w(f"\t\t{sources_phase_id} /* Sources */ = {{")
w("\t\t\tisa = PBXSourcesBuildPhase;")
w("\t\t\tbuildActionMask = 2147483647;")
w("\t\t\tfiles = (")
for bf_id, fr_id, name in build_files_sources:
    w(f"\t\t\t\t{bf_id} /* {name} in Sources */,")
w("\t\t\t);")
w("\t\t\trunOnlyForDeploymentPostprocessing = 0;")
w("\t\t};")
w("/* End PBXSourcesBuildPhase section */")

common_debug = f"""
\t\t\t\tALWAYS_SEARCH_USER_PATHS = NO;
\t\t\t\tASSETCATALOG_COMPILER_APPICON_NAME = AppIcon;
\t\t\t\tASSETCATALOG_COMPILER_GLOBAL_ACCENT_COLOR_NAME = AccentColor;
\t\t\t\tCLANG_ANALYZER_NONNULL = YES;
\t\t\t\tCLANG_ANALYZER_NUMBER_OBJECT_CONVERSION = YES_AGGRESSIVE;
\t\t\t\tCLANG_CXX_LANGUAGE_STANDARD = "gnu++20";
\t\t\t\tCLANG_ENABLE_MODULES = YES;
\t\t\t\tCLANG_ENABLE_OBJC_ARC = YES;
\t\t\t\tCLANG_ENABLE_OBJC_WEAK = YES;
\t\t\t\tCLANG_WARN_BLOCK_CAPTURE_AUTORELEASING = YES;
\t\t\t\tCLANG_WARN_BOOL_CONVERSION = YES;
\t\t\t\tCLANG_WARN_COMMA = YES;
\t\t\t\tCLANG_WARN_CONSTANT_CONVERSION = YES;
\t\t\t\tCLANG_WARN_DEPRECATED_OBJC_IMPLEMENTATIONS = YES;
\t\t\t\tCLANG_WARN_DIRECT_OBJC_ISA_USAGE = YES_ERROR;
\t\t\t\tCLANG_WARN_DOCUMENTATION_COMMENTS = YES;
\t\t\t\tCLANG_WARN_EMPTY_BODY = YES;
\t\t\t\tCLANG_WARN_ENUM_CONVERSION = YES;
\t\t\t\tCLANG_WARN_INFINITE_RECURSION = YES;
\t\t\t\tCLANG_WARN_INT_CONVERSION = YES;
\t\t\t\tCLANG_WARN_NON_LITERAL_NULL_CONVERSION = YES;
\t\t\t\tCLANG_WARN_OBJC_IMPLICIT_RETAIN_SELF = YES;
\t\t\t\tCLANG_WARN_OBJC_LITERAL_CONVERSION = YES;
\t\t\t\tCLANG_WARN_OBJC_ROOT_CLASS = YES_ERROR;
\t\t\t\tCLANG_WARN_QUOTED_INCLUDE_IN_FRAMEWORK_HEADER = YES;
\t\t\t\tCLANG_WARN_RANGE_LOOP_ANALYSIS = YES;
\t\t\t\tCLANG_WARN_STRICT_PROTOTYPES = YES;
\t\t\t\tCLANG_WARN_SUSPICIOUS_MOVE = YES;
\t\t\t\tCLANG_WARN_UNGUARDED_AVAILABILITY = YES_AGGRESSIVE;
\t\t\t\tCLANG_WARN_UNREACHABLE_CODE = YES;
\t\t\t\tCLANG_WARN__DUPLICATE_METHOD_MATCH = YES;
\t\t\t\tCOPY_PHASE_STRIP = NO;
\t\t\t\tDEBUG_INFORMATION_FORMAT = dwarf;
\t\t\t\tENABLE_STRICT_OBJC_MSGSEND = YES;
\t\t\t\tENABLE_TESTABILITY = YES;
\t\t\t\tGCC_C_LANGUAGE_STANDARD = gnu17;
\t\t\t\tGCC_DYNAMIC_NO_PIC = NO;
\t\t\t\tGCC_NO_COMMON_BLOCKS = YES;
\t\t\t\tGCC_OPTIMIZATION_LEVEL = 0;
\t\t\t\tGCC_PREPROCESSOR_DEFINITIONS = (
\t\t\t\t\t"DEBUG=1",
\t\t\t\t\t"$(inherited)",
\t\t\t\t);
\t\t\t\tGCC_WARN_64_TO_32_BIT_CONVERSION = YES;
\t\t\t\tGCC_WARN_ABOUT_RETURN_TYPE = YES_ERROR;
\t\t\t\tGCC_WARN_UNDECLARED_SELECTOR = YES;
\t\t\t\tGCC_WARN_UNINITIALIZED_AUTOS = YES_AGGRESSIVE;
\t\t\t\tGCC_WARN_UNUSED_FUNCTION = YES;
\t\t\t\tGCC_WARN_UNUSED_VARIABLE = YES;
\t\t\t\tGENERATE_INFOPLIST_FILE = YES;
\t\t\t\tINFOPLIST_KEY_UIApplicationSceneManifest_Generation = YES;
\t\t\t\tINFOPLIST_KEY_UIApplicationSupportsIndirectInputEvents = YES;
\t\t\t\tINFOPLIST_KEY_UILaunchScreen_Generation = YES;
\t\t\t\tINFOPLIST_KEY_UISupportedInterfaceOrientations_iPad = "UIInterfaceOrientationPortrait UIInterfaceOrientationPortraitUpsideDown UIInterfaceOrientationLandscapeLeft UIInterfaceOrientationLandscapeRight";
\t\t\t\tINFOPLIST_KEY_UISupportedInterfaceOrientations_iPhone = "UIInterfaceOrientationPortrait UIInterfaceOrientationLandscapeLeft UIInterfaceOrientationLandscapeRight";
\t\t\t\tMTL_ENABLE_DEBUG_INFO = INCLUDE_SOURCE;
\t\t\t\tMTL_FAST_MATH = YES;
\t\t\t\tONLY_ACTIVE_ARCH = YES;
\t\t\t\tSWIFT_ACTIVE_COMPILATION_CONDITIONS = "DEBUG $(inherited)";
\t\t\t\tSWIFT_EMIT_LOC_STRINGS = YES;
\t\t\t\tSWIFT_OPTIMIZATION_LEVEL = "-Onone";
\t\t\t\tSWIFT_VERSION = 5.0;
""".rstrip("\n")

common_release = common_debug.replace(
    "\t\t\t\tCOPY_PHASE_STRIP = NO;\n", ""
).replace(
    "\t\t\t\tDEBUG_INFORMATION_FORMAT = dwarf;\n", "\t\t\t\tDEBUG_INFORMATION_FORMAT = \"dwarf-with-dsym\";\n"
).replace(
    "\t\t\t\tENABLE_TESTABILITY = YES;\n", ""
).replace(
    '\t\t\t\tGCC_PREPROCESSOR_DEFINITIONS = (\n\t\t\t\t\t"DEBUG=1",\n\t\t\t\t\t"$(inherited)",\n\t\t\t\t);\n', ""
).replace(
    "\t\t\t\tGCC_OPTIMIZATION_LEVEL = 0;\n", ""
).replace(
    "\t\t\t\tONLY_ACTIVE_ARCH = YES;\n", "\t\t\t\tONLY_ACTIVE_ARCH = NO;\n\t\t\t\tVALIDATE_PRODUCT = YES;\n"
).replace(
    '\t\t\t\tSWIFT_ACTIVE_COMPILATION_CONDITIONS = "DEBUG $(inherited)";\n', ""
).replace(
    '\t\t\t\tSWIFT_OPTIMIZATION_LEVEL = "-Onone";\n', ""
)

w()
w("/* Begin XCBuildConfiguration section */")

w(f"\t\t{project_debug_cfg_id} /* Debug */ = {{")
w("\t\t\tisa = XCBuildConfiguration;")
w("\t\t\tbuildSettings = {")
w(common_debug)
w("\t\t\t};")
w("\t\t\tname = Debug;")
w("\t\t};")

w(f"\t\t{project_release_cfg_id} /* Release */ = {{")
w("\t\t\tisa = XCBuildConfiguration;")
w("\t\t\tbuildSettings = {")
w(common_release)
w("\t\t\t};")
w("\t\t\tname = Release;")
w("\t\t};")

target_common = f"""
\t\t\t\tASSETCATALOG_COMPILER_APPICON_NAME = AppIcon;
\t\t\t\tASSETCATALOG_COMPILER_GLOBAL_ACCENT_COLOR_NAME = AccentColor;
\t\t\t\tCODE_SIGN_STYLE = Automatic;
\t\t\t\tDEVELOPMENT_TEAM = Q5SQT5K24A;
\t\t\t\tCURRENT_PROJECT_VERSION = 1;
\t\t\t\tDEVELOPMENT_ASSET_PATHS = "";
\t\t\t\tENABLE_PREVIEWS = YES;
\t\t\t\tGENERATE_INFOPLIST_FILE = YES;
\t\t\t\tINFOPLIST_KEY_CFBundleDisplayName = Oversight;
\t\t\t\tINFOPLIST_KEY_LSApplicationCategoryType = "public.app-category.business";
\t\t\t\tINFOPLIST_KEY_NSCameraUsageDescription = "Oversight uses the camera to photograph site conditions for daily field log entries.";
				INFOPLIST_KEY_NSHumanReadableCopyright = "";
				INFOPLIST_KEY_NSPhotoLibraryUsageDescription = "Oversight accesses your photos to attach site documentation to daily log entries.";
\t\t\t\tIPHONEOS_DEPLOYMENT_TARGET = {IOS_DEPLOYMENT_TARGET};
\t\t\t\tMACOSX_DEPLOYMENT_TARGET = {MACOS_DEPLOYMENT_TARGET};
\t\t\t\tMARKETING_VERSION = 1.0;
\t\t\t\tPRODUCT_BUNDLE_IDENTIFIER = {BUNDLE_ID};
\t\t\t\tPRODUCT_NAME = "$(TARGET_NAME)";
\t\t\t\tSDKROOT = auto;
\t\t\t\tSUPPORTED_PLATFORMS = "iphoneos iphonesimulator macosx";
\t\t\t\tSUPPORTS_MACCATALYST = NO;
\t\t\t\tSUPPORTS_MAC_DESIGNED_FOR_IPHONE_IPAD = NO;
\t\t\t\tSWIFT_EMIT_LOC_STRINGS = YES;
\t\t\t\tSWIFT_VERSION = 5.0;
\t\t\t\tTARGETED_DEVICE_FAMILY = "1,2";
""".rstrip("\n")

w(f"\t\t{target_debug_cfg_id} /* Debug */ = {{")
w("\t\t\tisa = XCBuildConfiguration;")
w("\t\t\tbuildSettings = {")
w(target_common)
w("\t\t\t};")
w("\t\t\tname = Debug;")
w("\t\t};")

w(f"\t\t{target_release_cfg_id} /* Release */ = {{")
w("\t\t\tisa = XCBuildConfiguration;")
w("\t\t\tbuildSettings = {")
w(target_common)
w("\t\t\t};")
w("\t\t\tname = Release;")
w("\t\t};")

w("/* End XCBuildConfiguration section */")

w()
w("/* Begin XCConfigurationList section */")
w(f"\t\t{project_config_list_id} /* Build configuration list for PBXProject \"Oversight\" */ = {{")
w("\t\t\tisa = XCConfigurationList;")
w("\t\t\tbuildConfigurations = (")
w(f"\t\t\t\t{project_debug_cfg_id} /* Debug */,")
w(f"\t\t\t\t{project_release_cfg_id} /* Release */,")
w("\t\t\t);")
w("\t\t\tdefaultConfigurationIsVisible = 0;")
w("\t\t\tdefaultConfigurationName = Release;")
w("\t\t};")
w(f"\t\t{target_config_list_id} /* Build configuration list for PBXNativeTarget \"Oversight\" */ = {{")
w("\t\t\tisa = XCConfigurationList;")
w("\t\t\tbuildConfigurations = (")
w(f"\t\t\t\t{target_debug_cfg_id} /* Debug */,")
w(f"\t\t\t\t{target_release_cfg_id} /* Release */,")
w("\t\t\t);")
w("\t\t\tdefaultConfigurationIsVisible = 0;")
w("\t\t\tdefaultConfigurationName = Release;")
w("\t\t};")
w("/* End XCConfigurationList section */")

w("\t};")
w(f"\trootObject = {project_id} /* Project object */;")
w("}")

text = "\n".join(lines)

os.makedirs(os.path.dirname(PBXPROJ_PATH), exist_ok=True)
with open(PBXPROJ_PATH, "w") as f:
    f.write(text + "\n")

print(f"Wrote {PBXPROJ_PATH}")
print(f"Registered {len(build_files_sources)} Swift source files, {len(asset_catalogs)} asset catalog(s).")

# --- Patch the shared scheme with the real target id.
scheme_path = os.path.join(PROJECT_DIR, "Oversight.xcodeproj", "xcshareddata", "xcschemes", "Oversight.xcscheme")
if os.path.exists(scheme_path):
    import re
    with open(scheme_path) as f:
        scheme_text = f.read()
    scheme_text = scheme_text.replace("OVERSIGHT_TARGET_ID", target_id)
    scheme_text = re.sub(r'BlueprintIdentifier = "[A-F0-9]{24}"', f'BlueprintIdentifier = "{target_id}"', scheme_text)
    with open(scheme_path, "w") as f:
        f.write(scheme_text)
    print(f"Patched scheme with target id {target_id}")

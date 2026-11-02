import type { TabParamList } from "@/navigation/TabNavigator";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { NotesView } from "./NotesView";

type Props = BottomTabScreenProps<TabParamList, "Notes">;

/**
 * NotesScreen — Tab version of the notes list.
 */
export function NotesScreen({ route }: Props) {
  return <NotesView initialBookId={route?.params?.bookId} edges={["top"]} showBackButton={true} />;
}

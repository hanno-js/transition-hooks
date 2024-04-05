import React, { Fragment, useEffect, useRef, useState } from 'react'
import { insertArray } from '../helpers/insertArray'
import { setAnimationFrameTimeout } from '../helpers/setAnimationFrameTimeout'
import { STATUS, type StatusState, getState } from '../status'
import type { Timeout } from '../helpers/getTimeout'
import { getTimeout } from '../helpers/getTimeout'
import useMemoizedFn from '../helpers/useMemorizeFn'

type RenderCallback<Item> = (item: Item, stage: StatusState) => React.ReactNode

type ItemWithState<Item> = {
  item: Item
  key: number | string
} & StatusState

interface ItemWithKey<Item> {
  item: Item
  index: number
}

export function useListTransition<Item>(list: Array<Item>, options?: { timeout: Timeout, entered?: boolean, keyExtractor?: (item: Item) => string | number }) {
  const { timeout = 300, entered = true, keyExtractor: _keyExtractor } = options || {}
  const keyRef = useRef(0)
  const hasCustomKeyExtractor = !!_keyExtractor
  const keyExtractor = useMemoizedFn(_keyExtractor || (() => keyRef.current))
  // change list to our list form with extra information.
  const { enterTimeout, exitTimeout } = getTimeout(timeout)

  const [listState, setListState] = useState<Array<ItemWithState<Item>>>(
    () => list.map((item, _key) => ({
      item,
      key: hasCustomKeyExtractor ? keyExtractor(item) : keyRef.current++,
      ...getState(STATUS.entered),
    })),
  )

  useEffect(
    () => {
      const newItemsWithIndex: Array<ItemWithKey<Item>> = []

      list.forEach((item, index) => {
        if (listState.every(itemState => itemState.item !== item))
          newItemsWithIndex.push({ item, index })
      })

      // 1 add new items into list state
      if (newItemsWithIndex.length > 0) {
        setListState(prevListState =>
          newItemsWithIndex.reduce(
            (prev, { item, index }, _i) =>
              insertArray(prev, index, {
                item,
                key: hasCustomKeyExtractor ? keyExtractor(item) : keyRef.current++,
                ...getState(STATUS.from),
              }),
            prevListState,
          ),
        )
      }

      // 2 enter those new items immediatly
      if (
        newItemsWithIndex.length === 0
        && listState.some(item => item.status === 'from')
      ) {
        setAnimationFrameTimeout(() => {
          setListState(prev =>
            prev.map(item => {
              if (entered && item.status === 'from') {
                setAnimationFrameTimeout(() => {
                  setListState(prev =>
                    prev.map(_item =>
                      _item.key === item.key && _item.status === 'entering'
                        ? { ..._item, ...getState(STATUS.entered) }
                        : item,
                    ),
                  )
                }, enterTimeout)
              }
              return ({
                ...item,
                ...(item.status === 'from' ? getState(STATUS.entering) : {}),
              })
            }),
          )
        })
      }

      // 3 leave items from list state
      const subtractItemStates = listState.filter(
        itemState =>
          !list.includes(itemState.item) && itemState.status !== 'exiting',
      )
      const subtractItems = subtractItemStates.map(item => item.item)

      if (newItemsWithIndex.length === 0 && subtractItemStates.length > 0) {
        setListState(prev =>
          prev.map(itemState =>
            subtractItemStates.includes(itemState)
              ? { ...itemState, ...getState(STATUS.exiting) }
              : itemState,
          ),
        )

        setAnimationFrameTimeout(() => {
          setListState(prev =>
            prev.filter(item => !subtractItems.includes(item.item)),
          )
        }, exitTimeout)
      }

      if (
        hasCustomKeyExtractor
        && list.length === listState.length
        && list.some((item, index) => keyExtractor(item) !== listState[index].key)
      ) {
        setListState(
          list.map(item => ({
            item,
            key: keyExtractor(item),
            ...getState(STATUS.entered),
          })),
        )
      }
    },
    [list, listState, enterTimeout, exitTimeout, entered, keyExtractor, hasCustomKeyExtractor],
  )

  function transitionList(renderCallback: RenderCallback<Item>) {
    return listState.map(item => (
      <Fragment key={item.key}>
        {renderCallback(item.item, item)}
      </Fragment>
    ))
  }
  const isResolved = listState.every(item => item.isResolved)

  return { transitionList, isResolved }
}